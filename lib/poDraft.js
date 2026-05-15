// poDraft.js — persistent auto-save for unfinished Purchase Orders
// Keeps an in-progress "Create PO" form in localStorage so it survives
// page navigation, refreshes, and app restarts. One draft per user.

const KEY_PREFIX = 'bizpos_po_draft_'
const keyFor = (userId) => `${KEY_PREFIX}${userId || 'anon'}`

export const poDraft = {
  /** Persist the current form state. */
  save(userId, draft) {
    try {
      localStorage.setItem(keyFor(userId), JSON.stringify({ ...draft, savedAt: Date.now() }))
    } catch { /* storage full / unavailable — ignore */ }
  },

  /** Return the saved draft object, or null if none. */
  load(userId) {
    try {
      const raw = localStorage.getItem(keyFor(userId))
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  },

  /** Remove the saved draft. */
  clear(userId) {
    try { localStorage.removeItem(keyFor(userId)) } catch { /* ignore */ }
  },

  /** True if an unfinished draft exists for this user. */
  exists(userId) {
    try { return localStorage.getItem(keyFor(userId)) != null } catch { return false }
  },
}

export default poDraft
