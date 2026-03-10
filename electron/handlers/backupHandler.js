const { dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// LevelDB / Snappy recovery helpers
// ═══════════════════════════════════════════════════════════════════════════

// Read a base-128 little-endian unsigned varint from buf at pos.
// Returns [value, nextPos].
function lvVarUInt(buf, pos) {
  let v = 0, s = 0;
  while (pos < buf.length) {
    const b = buf[pos++];
    v |= (b & 0x7f) << s;
    s += 7;
    if (!(b & 0x80)) return [v, pos];
  }
  return [v, pos];
}

// ── Pure-JS Snappy decompressor ──────────────────────────────────────────
// Implements the Snappy block compression format used by Chrome's LevelDB.
function snappyDecompress(input) {
  let pos = 0;

  // Read uncompressed length (varint prefix)
  let ulen = 0, shift = 0;
  while (pos < input.length) {
    const b = input[pos++];
    ulen |= (b & 0x7f) << shift;
    shift += 7;
    if (!(b & 0x80)) break;
  }

  if (ulen <= 0 || ulen > 64 * 1024 * 1024) {
    throw new Error(`snappy: bad uncompressed length ${ulen}`);
  }

  const out = Buffer.allocUnsafe(ulen);
  let op = 0;

  while (pos < input.length && op < ulen) {
    const tag = input[pos++];
    const type = tag & 3;

    if (type === 0) {
      // ── LITERAL ──────────────────────────────────────────────────────
      const lb = (tag >> 2) & 63;
      let len;
      if      (lb < 60)   { len = lb + 1; }
      else if (lb === 60) { len = input[pos++] + 1; }
      else if (lb === 61) { len = input.readUInt16LE(pos) + 1; pos += 2; }
      else if (lb === 62) { len = (input[pos] | input[pos+1]<<8 | input[pos+2]<<16) + 1; pos += 3; }
      else                { len = input.readUInt32LE(pos) + 1; pos += 4; }

      if (pos + len > input.length || op + len > ulen) {
        throw new Error('snappy: literal overflow');
      }
      input.copy(out, op, pos, pos + len);
      op += len; pos += len;

    } else if (type === 1) {
      // ── COPY 1-byte offset ───────────────────────────────────────────
      const len    = 4 + ((tag >> 2) & 7);
      const offset = ((tag & 0xe0) << 3) | input[pos++];
      if (offset === 0 || offset > op) throw new Error(`snappy: bad copy1 offset=${offset} op=${op}`);
      const src = op - offset;
      for (let i = 0; i < len && op < ulen; i++) out[op++] = out[src + i];

    } else if (type === 2) {
      // ── COPY 2-byte offset ───────────────────────────────────────────
      const len    = 1 + ((tag >> 2) & 63);
      const offset = input.readUInt16LE(pos); pos += 2;
      if (offset === 0 || offset > op) throw new Error(`snappy: bad copy2 offset=${offset} op=${op}`);
      const src = op - offset;
      for (let i = 0; i < len && op < ulen; i++) out[op++] = out[src + i];

    } else {
      // ── COPY 4-byte offset ───────────────────────────────────────────
      const len    = 1 + ((tag >> 2) & 63);
      const offset = input.readUInt32LE(pos); pos += 4;
      if (offset === 0 || offset > op) throw new Error(`snappy: bad copy4 offset=${offset} op=${op}`);
      const src = op - offset;
      for (let i = 0; i < len && op < ulen; i++) out[op++] = out[src + i];
    }
  }

  return out.slice(0, op);
}

// ── LevelDB block decompression ──────────────────────────────────────────
// Each LevelDB block has a 5-byte trailer: [type:1][crc32:4].
// type 0 = no compression, type 1 = Snappy.
function decompressLevelDBBlock(buf, blockOffset, blockSize) {
  const compType = buf[blockOffset + blockSize]; // byte right after block data
  const blockData = buf.slice(blockOffset, blockOffset + blockSize);
  if (compType === 1) return snappyDecompress(blockData);
  return blockData; // type 0 = already raw
}

// ── Parse a LevelDB .log (write-ahead log) file ──────────────────────────
// Format: 32 KB blocks, each record has a 7-byte header [crc:4][len:2][type:1].
// Record types: 1=FULL, 2=FIRST, 3=MIDDLE, 4=LAST.
function parseLevelDBLog(buf) {
  const BLOCK = 32768, HDR = 7;
  const records = [];
  let pending = null;

  for (let base = 0; base < buf.length; base += BLOCK) {
    let p = base;
    const end = Math.min(base + BLOCK, buf.length);
    while (p + HDR <= end) {
      const len     = buf.readUInt16LE(p + 4);
      const type    = buf[p + 6];
      const dataEnd = p + HDR + len;
      if (len === 0 || dataEnd > end) break;
      const chunk = buf.slice(p + HDR, dataEnd);
      if      (type === 1) { records.push(chunk); pending = null; }
      else if (type === 2) { pending = Buffer.from(chunk); }
      else if (type === 3 && pending) { pending = Buffer.concat([pending, chunk]); }
      else if (type === 4 && pending) { records.push(Buffer.concat([pending, chunk])); pending = null; }
      p = dataEnd;
    }
  }
  return records;
}

// ── Iterate all key-value entries in a decompressed LevelDB data block ───
// LevelDB uses delta/prefix encoding: each entry stores only the non-shared
// suffix of its key. The restart array at the block tail is ignored here
// since we iterate from the start anyway.
function iterateBlock(block, callback) {
  if (block.length < 4) return;

  const numRestarts = block.readUInt32LE(block.length - 4);
  // Sanity: restart count can't need more space than the block itself
  if (numRestarts > block.length / 4) return;
  const dataEnd = block.length - 4 - (numRestarts * 4);
  if (dataEnd <= 0) return;

  let pos = 0;
  let prevKey = Buffer.alloc(0);

  while (pos < dataEnd) {
    let shared, nonShared, valLen;
    [shared,    pos] = lvVarUInt(block, pos);
    [nonShared, pos] = lvVarUInt(block, pos);
    [valLen,    pos] = lvVarUInt(block, pos);

    if (pos + nonShared + valLen > block.length) break;

    // Reconstruct full key via delta decoding
    const fullKey = Buffer.concat([
      prevKey.slice(0, shared),
      block.slice(pos, pos + nonShared)
    ]);
    const val = block.slice(pos + nonShared, pos + nonShared + valLen);
    pos += nonShared + valLen;
    prevKey = fullKey;

    callback(fullKey, val);
  }
}

// ── Try to extract a JSON object from a value buffer ────────────────────
// Chrome's localStorage values have a small prefix before the JSON
// (a varint length in WriteBatch records, or a 0x01 version byte in SST).
// We scan for '{' within the first 20 bytes and parse from there.
function extractJSONFromValue(val) {
  const limit = Math.min(val.length, 20);
  for (let i = 0; i < limit; i++) {
    if (val[i] !== 0x7b) continue; // '{'
    // Found '{' — now extract balanced JSON
    let depth = 0, inStr = false, esc = false;
    const maxScan = Math.min(val.length, i + 32 * 1024 * 1024);
    for (let j = i; j < maxScan; j++) {
      const c = val[j];
      if (esc)              { esc = false; continue; }
      if (c === 0x5c && inStr) { esc = true; continue; }
      if (c === 0x22)       { inStr = !inStr; continue; }
      if (!inStr) {
        if      (c === 0x7b) depth++;
        else if (c === 0x7d) {
          if (--depth === 0) {
            try { return JSON.parse(val.slice(i, j + 1).toString('utf8')); } catch (_) {}
            break;
          }
        }
      }
    }
    break; // only try the first '{'
  }
  return null;
}

// ── Merge a cache result into the portBestCache map ──────────────────────
function mergeCacheResult(portBestCache, port, cache) {
  if (!cache || !Array.isArray(cache.orders)) return;
  const orders = cache.orders;
  const existing = portBestCache.get(port);
  if (!existing || orders.length > existing.totalOrders) {
    portBestCache.set(port, {
      port,
      totalOrders:    orders.length,
      unsyncedOrders: orders.filter(o => !o._isSynced),
      syncedOrders:   orders.filter(o =>  o._isSynced),
      lastSync:       cache.lastSync || null,
    });
  }
}

// ── Scan a .log file for pos_cache entries ───────────────────────────────
// .log records are WriteBatch entries. We use the proper block/record parser
// to get clean record data, then binary-scan for the pos_cache marker.
const POS_CACHE_MARKER = Buffer.from('\x00\x01pos_cache', 'ascii');

function scanLogFile(buf, portBestCache) {
  const records = parseLevelDBLog(buf);
  for (const rec of records) {
    let from = 0;
    while (true) {
      const idx = rec.indexOf(POS_CACHE_MARKER, from);
      if (idx === -1) break;

      // Extract port from the key bytes that precede the marker
      const back = rec.slice(Math.max(0, idx - 100), idx).toString('ascii');
      const m = back.match(/127\.0\.0\.1:(\d+)/);
      const port = m ? m[1] : 'unknown';

      // Value comes after the marker. In WriteBatch records there's a varint
      // length prefix, then the value bytes (starting with 0x01 version byte).
      // Scan for '{' within 40 bytes.
      const valStart = idx + POS_CACHE_MARKER.length;
      const cache = extractJSONFromValue(rec.slice(valStart, valStart + 40 + 32 * 1024 * 1024));
      if (cache) mergeCacheResult(portBestCache, port, cache);

      from = idx + 1;
    }
  }
}

// ── Scan an .ldb SST file for pos_cache entries ──────────────────────────
// Chrome's LevelDB magic: 0xdb4775248b80fb57 (LE bytes: 57 fb 80 8b 24 75 47 db)
const CHROME_LDB_MAGIC = Buffer.from([0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb]);

function scanSSTFile(buf, portBestCache) {
  if (buf.length < 53) return; // need at least footer + 1 block

  // Check Chrome LevelDB magic (last 8 bytes of 48-byte footer)
  const footer = buf.slice(buf.length - 48);
  if (!footer.slice(40).equals(CHROME_LDB_MAGIC)) return;

  // Parse footer: [metaindex_handle][index_handle][padding][magic]
  // Each handle = [offset:varint][size:varint]
  let pos = 0;
  let miOff, miSz, ixOff, ixSz;
  [miOff, pos] = lvVarUInt(footer, pos);
  [miSz,  pos] = lvVarUInt(footer, pos);
  [ixOff, pos] = lvVarUInt(footer, pos);
  [ixSz,  pos] = lvVarUInt(footer, pos);

  if (ixOff + ixSz + 5 > buf.length) return;

  // Decompress the index block to get handles for all data blocks
  let indexBlock;
  try {
    indexBlock = decompressLevelDBBlock(buf, ixOff, ixSz);
  } catch (_) {
    return;
  }

  // Parse the index block (same delta-encoded format as data blocks).
  // Each entry's value is a data block handle: [offset:varint][size:varint].
  const dataHandles = [];
  iterateBlock(indexBlock, (_key, handleBuf) => {
    let dbOff, dbSz, hp = 0;
    [dbOff, hp] = lvVarUInt(handleBuf, 0);
    [dbSz]      = lvVarUInt(handleBuf, hp);
    if (dbOff + dbSz + 5 <= buf.length) {
      dataHandles.push({ off: dbOff, sz: dbSz });
    }
  });

  // Scan each data block
  for (const { off, sz } of dataHandles) {
    let block;
    try {
      block = decompressLevelDBBlock(buf, off, sz);
    } catch (_) {
      continue;
    }

    // Iterate key-value pairs; find ones whose full key contains 'pos_cache'
    iterateBlock(block, (fullKey, val) => {
      const keyStr = fullKey.toString('ascii');
      if (!keyStr.includes('pos_cache')) return;

      const m = keyStr.match(/127\.0\.0\.1:(\d+)/);
      const port = m ? m[1] : 'unknown';

      const cache = extractJSONFromValue(val);
      if (cache) mergeCacheResult(portBestCache, port, cache);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Persistent config helpers (userData/bizpos-config.json)
// ═══════════════════════════════════════════════════════════════════════════

function getConfigPath() {
  return path.join(app.getPath('userData'), 'bizpos-config.json');
}

function readConfig() {
  try {
    const p = getConfigPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) { return {}; }
}

function writeConfig(data) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify({ ...readConfig(), ...data }, null, 2), 'utf8');
    return true;
  } catch (_) { return false; }
}

// ═══════════════════════════════════════════════════════════════════════════
// IPC handlers
// ═══════════════════════════════════════════════════════════════════════════

function registerBackupHandlers(ipcMain) {

  // Open folder picker dialog
  ipcMain.handle('backup:select-folder', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Select Backup Folder',
      buttonLabel: 'Select Folder',
      properties: ['openDirectory', 'createDirectory']
    });
    if (canceled || !filePaths.length) return { canceled: true };
    return { canceled: false, path: filePaths[0] };
  });

  // Create backup folder + placeholder index
  ipcMain.handle('backup:init-folder', async (event, { folderPath }) => {
    try {
      if (!folderPath) return { success: false, error: 'No folder path provided' };
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
      const indexPath = path.join(folderPath, 'offline_backup_index.json');
      if (!fs.existsSync(indexPath)) {
        fs.writeFileSync(indexPath, JSON.stringify({
          initialized: new Date().toISOString(),
          app_version: app.getVersion(),
          last_saved: null,
          files: []
        }, null, 2), 'utf8');
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Auto-save offline data to backup folder
  ipcMain.handle('backup:auto-save', async (event, { data, folderPath }) => {
    try {
      if (!folderPath) return { success: false, error: 'No backup folder set' };
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

      const savedFiles = [];
      for (const [key, value] of Object.entries(data)) {
        const filePath = path.join(folderPath, `${key}.json`);
        fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
        savedFiles.push(path.basename(filePath));
      }

      const indexPath = path.join(folderPath, 'offline_backup_index.json');
      fs.writeFileSync(indexPath, JSON.stringify({
        last_saved: new Date().toISOString(),
        app_version: app.getVersion(),
        files: savedFiles
      }, null, 2), 'utf8');

      return { success: true, files: savedFiles };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Read backup index for settings page
  ipcMain.handle('backup:read-index', async (event, { folderPath }) => {
    try {
      const indexPath = path.join(folderPath, 'offline_backup_index.json');
      if (!fs.existsSync(indexPath)) return { success: false, error: 'No backup found' };
      return { success: true, index: JSON.parse(fs.readFileSync(indexPath, 'utf8')) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Load a specific backup file
  ipcMain.handle('backup:load-file', async (event, { filePath }) => {
    try {
      if (!fs.existsSync(filePath)) return { success: false, error: 'File not found' };
      return { success: true, data: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Return OS Documents folder as default backup location
  ipcMain.handle('backup:default-path', () => {
    return { path: app.getPath('documents') };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DATA RECOVERY — scan every past localStorage port session stored in the
  // LevelDB database and extract pos_cache orders.
  //
  // Strategy:
  //   • Prefer the startup SNAPSHOT (taken in main.js BEFORE createWindow so
  //     Chromium hasn't compacted anything yet). The snapshot preserves the
  //     raw .log file from the PREVIOUS session alongside older .ldb files.
  //   • Fall back to a live copy of the DB if no snapshot exists.
  //
  // Parsing:
  //   • .log files  → proper 32KB-block / record parser (no block-header noise)
  //   • .ldb files  → Chrome-magic SST parser + pure-JS Snappy decompressor
  //                   + full LevelDB delta-key decoding (never misses entries)
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('backup:scan-all-ports', async () => {
    const os = require('os');
    try {
      const snapshotPath    = path.join(app.getPath('userData'), 'bizpos-recovery-snapshot');
      const liveLeveldbPath = path.join(app.getPath('userData'), 'Local Storage', 'leveldb');

      let scanDir  = null;
      let tempDir  = null;
      let usedSnapshot = false;

      if (fs.existsSync(snapshotPath) && fs.readdirSync(snapshotPath).length > 0) {
        scanDir = snapshotPath;
        usedSnapshot = true;
        console.log('[Recovery] Using startup snapshot');
      } else if (fs.existsSync(liveLeveldbPath)) {
        console.log('[Recovery] No snapshot — copying live LevelDB...');
        tempDir = path.join(os.tmpdir(), `bizpos-recovery-${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });
        for (const file of fs.readdirSync(liveLeveldbPath)) {
          if (file === 'LOCK') continue;
          try { fs.copyFileSync(path.join(liveLeveldbPath, file), path.join(tempDir, file)); } catch (_) {}
        }
        scanDir = tempDir;
      } else {
        return { success: false, error: 'No localStorage database found on this machine.' };
      }

      // portBestCache: port -> { port, totalOrders, unsyncedOrders, syncedOrders, lastSync }
      const portBestCache = new Map();

      const files = fs.readdirSync(scanDir).filter(f => f.endsWith('.ldb') || f.endsWith('.log'));

      for (const file of files) {
        const buf = fs.readFileSync(path.join(scanDir, file));
        try {
          if (file.endsWith('.log')) {
            scanLogFile(buf, portBestCache);
          } else {
            scanSSTFile(buf, portBestCache);
          }
        } catch (fileErr) {
          console.warn(`[Recovery] Error scanning ${file}:`, fileErr.message);
        }
      }

      if (tempDir) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
      }

      const allCaches = Array.from(portBestCache.values())
        .filter(c => c.totalOrders > 0)
        .sort((a, b) => b.totalOrders - a.totalOrders);

      const totalUnsynced = allCaches.reduce((sum, c) => sum + c.unsyncedOrders.length, 0);

      console.log(`[Recovery] Scanned ${files.length} files → ${allCaches.length} sessions, ${totalUnsynced} unsynced orders`);

      return {
        success: true,
        filesScanned: files.length,
        totalSessions: allCaches.length,
        totalUnsyncedOrders: totalUnsynced,
        usedSnapshot,
        caches: allCaches,
      };

    } catch (err) {
      console.error('[Recovery] scan-all-ports error:', err);
      return { success: false, error: err.message };
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIG PERSISTENCE
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('backup:save-config', async (event, { folderPath }) => {
    try {
      const ok = writeConfig({ backupFolderPath: folderPath });
      return { success: ok };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('backup:load-config', async () => {
    try {
      const config = readConfig();
      return { success: true, folderPath: config.backupFolderPath || null };
    } catch (err) {
      return { success: false, folderPath: null, error: err.message };
    }
  });

  // Restore all backup files from a folder and return data to the renderer.
  ipcMain.handle('backup:restore-from-folder', async (event, { folderPath }) => {
    try {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return { success: false, error: 'Backup folder not found' };
      }

      const keys = ['pos_cache', 'pos_customers', 'pending_order_changes_sync', 'order_changes'];
      const data = {};

      for (const key of keys) {
        const filePath = path.join(folderPath, `${key}.json`);
        if (fs.existsSync(filePath)) {
          try { data[key] = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (_) {}
        }
      }

      const orderCount = data.pos_cache?.orders?.length || 0;
      console.log(`[Backup] Restored: ${orderCount} orders in pos_cache`);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerBackupHandlers };
