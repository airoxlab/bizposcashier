# BizPOS Cashier — Project Context

## What This Is
BizPOS Cashier is a desktop Point-of-Sale application for restaurants and cafes. It runs as both a **Next.js web app** (dev/browser) and an **Electron desktop app** (production installer). The same codebase serves both targets via a static export build.

---

## Tech Stack
| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| Database | Supabase (PostgreSQL) |
| Desktop | Electron 32 |
| Icons | lucide-react |
| Animation | framer-motion |
| Charts | recharts |
| Toasts | react-hot-toast |
| Printing | node-thermal-printer (USB/network thermal printers) |
| WhatsApp | @whiskeysockets/baileys |

---

## Project Structure

```
bizposcashier/
├── app/                    # Next.js App Router pages
│   ├── layout.js           # Root layout: TrialBanner, GlobalPrintListener, TrialExpiredGate
│   ├── page.js             # Login / entry point
│   ├── dashboard/          # Dashboard overview
│   ├── new-order/          # Main POS order screen
│   ├── walkin/             # Walk-in order flow
│   ├── delivery/           # Delivery order flow
│   ├── takeaway/           # Takeaway order flow
│   ├── orders/             # Order history & management
│   ├── kds/                # Kitchen Display System
│   ├── web-orders/         # Online/web orders
│   ├── payment/            # Payment processing
│   ├── reports/            # Sales reports & analytics
│   ├── expenses/           # Expense tracking
│   ├── riders/             # Delivery rider management
││   ├── offline-orders/     # Offline order queue
│   ├── marketing/          # Marketing module
│   ├── printer/            # Printer configuration
│   └── settings/           # App settings
│       ├── page.js
│       ├── customer-account/
│       └── whatsapp/
├── components/
│   ├── pos/                # POS-specific components (cart, products, payment inline)
│   ├── modals/             # PaymentModal, RecordPaymentModal, LedgerTab
│   ├── ui/                 # Shared UI: Modal, PinPad, FastNumberPad, PlanGate, NotificationSystem
│   ├── settings/           # Settings components
│   ├── delivery/           # Delivery-specific components
│   ├── marketing/          # Marketing components
│   ├── ProtectedPage.js    # Auth guard wrapper
│   ├── TrialBanner.js      # Trial status banner
│   ├── TrialExpiredGate.js # Blocks expired trial users
│   ├── GlobalPrintListener.js  # Listens for print events across app
│   └── UpdateNotification.jsx  # Electron auto-update UI
├── lib/                    # Singleton managers (core business logic)
│   ├── supabase.js         # Supabase client (env: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)
│   ├── authManager.js      # Login, session, roles (admin/cashier)
│   ├── cacheManager.js     # Offline-first data cache (localStorage + Supabase sync)
│   ├── planManager.js      # Plan/feature gating (Starter/Growth/Business)
│   ├── permissionManager.js    # Staff role permissions
│   ├── printerManager.js       # Thermal printer (USB + network)
│   ├── networkPrintManager.js  # Network print jobs
│   ├── loyaltyManager.js       # Loyalty points system
│   ├── customerLedgerManager.js # Customer credit accounts
│   ├── ledgerManager.js        # Ledger operations
│   ├── paymentTransactionManager.js # Split payment tracking
││   ├── profileManager.js       # Business profile
│   ├── themeManager.js         # Dark/light theme (cookie + localStorage)
│   ├── webOrderNotification.js # Web order alerts
│   ├── whatsappAutoSend.js     # Auto WhatsApp receipt sending
│   ├── accountAutoSend.js      # Auto account statement sending
│   └── orderReopenHandler.js   # Reopen closed orders
├── electron/
│   ├── main.js             # Electron main process
│   ├── preload.js          # Context bridge / IPC
│   ├── printing/           # Electron-side print handlers
│   ├── whatsapp/           # Electron WhatsApp bridge
│   └── drivers/            # Bundled printer drivers
├── hooks/
│   ├── useAlert.js         # Custom alert hook
│   └── useTheme.js         # Theme hook
├── utils/
│   └── thermal.js          # Thermal receipt formatting
├── database/               # SQL schema files
├── next.config.js          # Static export in prod, dev server in dev
├── tailwind.config.js
└── package.json
```

---

## Key Patterns

### Singleton Managers
All core logic lives in `lib/` as singletons. Import them directly — do not re-instantiate:
```js
import { supabase } from '@/lib/supabase'
import cacheManager from '@/lib/cacheManager'
import authManager from '@/lib/authManager'
import { planManager } from '@/lib/planManager'
```

### Offline-First Cache (`lib/cacheManager.js`)
- Singleton class, bootstraps synchronously from `localStorage` (`pos_cache` key) on construction
- Syncs categories, menus, products, variants, customers, orders, deals, tables, order_takers, delivery_boys, expenses
- Pending offline operations queue in `pendingStatusUpdates`
- Call `cacheManager.initializeCache(userId)` after login

### Authentication (`lib/authManager.js`)
- Login with phone + password (no Supabase Auth — custom `users` table)
- Two roles: `admin` (full access) and `cashier` (restricted by permissionManager)
- Session stored in localStorage key `BizPOS_auth`, 24h TTL
- After login, loads `planManager` and `cacheManager`

### Plan / Feature Gating (`lib/planManager.js`)
Three tiers: **Starter → Growth → Business**

Feature flags resolved in priority order: `user_feature_overrides` > `plan_features` > safe default

```js
planManager.can('loyalty_system')       // boolean feature toggle
planManager.getLimit('max_products')    // numeric limit (Infinity = unlimited)
planManager.getPlanSlug()               // 'starter' | 'growth' | 'business'
```

Gate features in UI using `<PlanGate feature="loyalty_system">`:
```jsx
import PlanGate from '@/components/ui/PlanGate'
<PlanGate feature="kds"><KDSPage /></PlanGate>
```

Growth-only features: `loyalty_system`, `kds`, `inventory_tracking`, `whatsapp_receipts`, `staff_permissions`, `customer_ledger`, `rider_management`, `purchase_orders`, `audit_logs`

Business-only features: `multi_branch`, `payroll`, `petty_cash`, `advanced_analytics`, `tablet_ordering`, `customer_website`, `marketing_module`

### Theme (`lib/themeManager.js`)
Stored in cookie (`theme`) + localStorage. Read synchronously in root layout via inline script to prevent flash. Classes applied to `<html>`: `light` or `dark`.

### Build Modes
- **Dev**: `npm run dev` → Next.js dev server on port 3000, no static export, source maps off for speed
- **Electron dev**: `npm run electron-dev` → runs both concurrently
- **Production**: `npm run build` → static export to `out/`, then Electron packages it
- **Windows installer**: `npm run build-win` → produces `dist/BizPOS-Setup-x.x.x.exe`
- **GitHub releases**: published to `airoxlab/bizposcashier`

### Static Export Constraint
Production is `output: 'export'` (no server). All data fetching must be client-side. No Next.js API routes used in production.

---

## Database (Supabase)
Key tables referenced in code:
- `users` — admin users (phone, password, customer_name, is_active)
- `cashiers` — cashier staff accounts
- `sessions` — login sessions
- `user_subscriptions` — plan subscription per user (joins `plans`)
- `plans` — plan definitions (slug: starter/growth/business)
- `plan_features` — feature key/value per plan
- `user_feature_overrides` — per-user feature overrides
- `categories`, `menus`, `products`, `variants` — menu catalog
- `orders`, `order_items` — order records
- `customers` — customer profiles
- `tables` — dine-in table layout
- `deals`, `deal_products` — promotional deals
- `expenses`, `expense_categories`, `expense_subcategories`
- `riders` — delivery riders
- `order_takers` — staff who take orders

Supabase URL stored in env: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Printing
- USB thermal printers via `node-thermal-printer` (Electron)
- Network printers via `networkPrintManager`
- Receipt formatting in `utils/thermal.js`
- Electron printer drivers bundled in `electron/drivers/`
- `GlobalPrintListener` component listens for `CustomEvent('print-receipt')` across the app

---

## WhatsApp Integration
- Uses `@whiskeysockets/baileys` (WhatsApp Web API)
- Runs inside Electron main process (`electron/whatsapp/`)
- Sends receipts automatically via `lib/whatsappAutoSend.js`
- Settings managed at `/settings/whatsapp`

---

## Env Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## Do Not
- Do not use Next.js API routes — static export breaks them in production
- Do not create multiple instances of singleton managers — import the exported singleton
- Do not use `next/image` optimization — `unoptimized: true` is set (Electron constraint)
- Do not add server-side `getServerSideProps` — client-only app
