# Network Printing Setup Guide

## Overview
The Network Printing feature allows multiple POS terminals to share a single USB printer. One terminal acts as the "print server" (connected to the USB printer), while other terminals send print jobs over the network via Supabase realtime.

## How It Works

1. **Print Server Terminal** (has USB printer):
   - Turns ON both toggles:
     - ✅ Share Printer Mode
     - ✅ I am Server
   - Listens for print jobs from other terminals
   - Automatically prints when jobs arrive

2. **Client Terminals** (no printer):
   - Turn ON only:
     - ✅ Share Printer Mode
     - ❌ I am Server (OFF)
   - Send print jobs to the network
   - Print server receives and prints them

## Setup Steps

### 1. Run Database Migration
Execute the SQL file to create the required table:
```bash
# Connect to your Supabase database and run:
psql -h your-db-host -U your-user -d your-database -f database/network_print_jobs_table.sql
```

Or copy-paste the SQL from `database/network_print_jobs_table.sql` into your Supabase SQL editor.

### 2. Configure Main Terminal (with USB Printer)
1. Go to **Printer Management** page
2. In the "Network Printing" section:
   - Toggle **Share Printer Mode** → ON
   - Toggle **I am Server** → ON
3. You'll see: "Listening for print jobs..."

### 3. Configure Other Terminals
1. Go to **Printer Management** page
2. In the "Network Printing" section:
   - Toggle **Share Printer Mode** → ON
   - Toggle **I am Server** → OFF (leave off)
3. You'll see: "Network printing active"

### 4. Integrate with Receipt Printing

The system automatically detects network mode. When printing a receipt:

```javascript
import { networkPrintManager } from './lib/networkPrintManager'

// Check if should use network printing
if (networkPrintManager.shouldUseNetwork()) {
  // Send to network instead of printing directly
  const result = await networkPrintManager.sendPrintJobToNetwork(printData, userId)
} else {
  // Print directly via USB (server mode or network disabled)
  await window.electron.invoke('print-receipt', printData)
}
```

## Features

- ✅ Real-time print job delivery via Supabase
- ✅ Automatic job status tracking (pending/completed/failed)
- ✅ Auto-cleanup of old jobs (1 hour)
- ✅ No additional server or port forwarding needed
- ✅ Works over LAN or internet (via Supabase)

## Troubleshooting

### Print jobs not arriving at server
1. Check both terminals have internet connection
2. Verify server terminal has both toggles ON
3. Check Supabase console for `network_print_jobs` table entries
4. Ensure all terminals use the same user account

### Print jobs stuck in "pending"
1. Restart the print server terminal
2. Check USB printer is connected and working
3. Verify server terminal is listening (check console logs)

### Performance issues
- The auto-cleanup runs periodically to remove old jobs
- You can manually clean up: Run `cleanup_old_print_jobs()` in Supabase

## Security

- Row Level Security (RLS) is enabled
- Users can only see their own print jobs
- Print data is stored temporarily and auto-deleted after 1 hour
- All communication is encrypted via Supabase

## Cost Considerations

- Each print job creates 1 database insert + 1 update
- Realtime connections count toward Supabase realtime limits
- For high-volume printing, monitor your Supabase usage

## Alternative: Direct Network Sharing

If you prefer not to use Supabase realtime, you can:
1. Use Windows/Mac built-in printer sharing
2. Install printer driver on all terminals
3. Share USB printer over network
4. Configure printer as "network printer" in the app

The Supabase method is recommended for ease of setup and reliability.
