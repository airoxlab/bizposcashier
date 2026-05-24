// lib/planManager.js
// Singleton — mirrors permissionManager pattern.
// Loads plan + features + overrides from Supabase after login.
// Caches to localStorage so it survives page refreshes and works offline.

import { supabase } from './supabase'

const CACHE_KEY = 'bizpos_plan_cache'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 h

// Required plan per feature (used for upgrade messages)
const FEATURE_PLAN_MAP = {
  loyalty_system:     'Growth',
  kds:                'Growth',
  inventory_tracking: 'Growth',
  whatsapp_receipts:  'Growth',
  staff_permissions:  'Growth',
  customer_ledger:    'Growth',
  purchase_orders:    'Growth',
  audit_logs:         'Growth',
  marketing_module:   'Growth',
  multi_branch:       'Business',
  payroll:            'Business',
  advanced_analytics: 'Business',
  tablet_ordering:    'Business',
  customer_website:   'Business',
}

const PLAN_COLORS = {
  starter:  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300', hex: '#10b981' },
  growth:   { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-300',    hex: '#3b82f6' },
  business: { bg: 'bg-rose-100',    text: 'text-rose-700',    border: 'border-rose-300',    hex: '#f43f5e' },
}

class PlanManager {
  constructor() {
    this.plan      = null   // { id, slug, name, price_monthly, status, started_at, expires_at }
    this.features  = new Map() // feature_key → value string
    this.overrides = new Map() // feature_key → override object
    this.graceDays = 7      // global: days after expiry before the whole app locks
    this.isLoaded  = false
    this._cacheHit = false
    // Latest subscription invoice — intentionally NOT cached (always fetched fresh so due_date
    // changes made in super-admin are visible immediately on next load or refresh).
    this.invoice   = null

    if (typeof window !== 'undefined') {
      this._hydrateFromCache()
    }
  }

  // ─── Cache ──────────────────────────────────────────────────────────────

  _hydrateFromCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return
      const { data, cachedAt } = JSON.parse(raw)
      if (Date.now() - cachedAt > CACHE_TTL) return

      this.plan      = data.plan
      this.features  = new Map(Object.entries(data.features  || {}))
      this.overrides = new Map(Object.entries(data.overrides || {}))
      this.graceDays = data.graceDays ?? 7
      this.isLoaded  = true
      this._cacheHit = true
      window.dispatchEvent(new CustomEvent('planmanager:loaded'))
    } catch {}
  }

  _saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: {
          plan:      this.plan,
          features:  Object.fromEntries(this.features),
          overrides: Object.fromEntries(this.overrides),
          graceDays: this.graceDays,
        },
        cachedAt: Date.now(),
      }))
    } catch {}
  }

  // ─── Load ───────────────────────────────────────────────────────────────

  async load(userId) {
    if (!userId) return false
    // If we already have cached data keep isLoaded=true so the UI stays functional
    // during a background refresh. Only block the UI when there is genuinely no data.
    const hadCache = this.isLoaded
    if (!hadCache) this.isLoaded = false
    try {
      // Fetch subscription + plan + its features in one query
      const { data: sub, error } = await supabase
        .from('user_subscriptions')
        .select(`
          id, status, started_at, expires_at, notes,
          plan:plan_id (
            id, slug, name, description, price_monthly,
            plan_features ( feature_key, value )
          )
        `)
        .eq('user_id', userId)
        .single()

      if (error || !sub) {
        // No subscription row — default to starter limits (still functional)
        return await this._loadDefaultPlan(userId)
      }

      this.plan = {
        id:            sub.plan.id,
        slug:          sub.plan.slug,
        name:          sub.plan.name,
        description:   sub.plan.description,
        price_monthly: sub.plan.price_monthly,
        status:        sub.status,
        started_at:    sub.started_at,
        expires_at:    sub.expires_at,
        notes:         sub.notes,
      }

      this.features = new Map()
      for (const f of (sub.plan.plan_features || [])) {
        this.features.set(f.feature_key, f.value)
      }

      // Fetch overrides (filter expired on client to avoid index dependency)
      const { data: overrides } = await supabase
        .from('user_feature_overrides')
        .select('*')
        .eq('user_id', userId)

      this.overrides = new Map()
      const now = new Date()
      for (const o of (overrides || [])) {
        if (o.expires_at && new Date(o.expires_at) < now) continue
        this.overrides.set(o.feature_key, o)
      }

      await this._loadGraceDays()
      await this._loadLatestInvoice(userId)

      this.isLoaded = true
      this._saveCache()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('planmanager:loaded'))
      }
      return true

    } catch (err) {
      console.error('PlanManager.load error:', err)
      // If we had cached data before this attempt, restore loaded state so the UI
      // keeps working offline or when the server is temporarily unreachable.
      if (hadCache) this.isLoaded = true
      return hadCache || this._cacheHit
    }
  }

  async _loadDefaultPlan(userId = null) {
    try {
      const { data: plan } = await supabase
        .from('plans')
        .select('*, plan_features ( feature_key, value )')
        .eq('slug', 'starter')
        .single()

      if (!plan) return false

      this.plan = {
        id:            plan.id,
        slug:          plan.slug,
        name:          plan.name,
        description:   plan.description,
        price_monthly: plan.price_monthly,
        status:        'trial',
        started_at:    new Date().toISOString(),
        expires_at:    null,
      }

      this.features = new Map()
      for (const f of (plan.plan_features || [])) {
        this.features.set(f.feature_key, f.value)
      }

      this.overrides = new Map()
      await this._loadGraceDays()
      if (userId) await this._loadLatestInvoice(userId)
      this.isLoaded  = true
      this._saveCache()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('planmanager:loaded'))
      }
      return true
    } catch {
      return false
    }
  }

  // Loads the global grace period (days) from app_settings.
  async _loadGraceDays() {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'grace_days')
        .single()
      const n = parseInt(data?.value, 10)
      if (!isNaN(n) && n >= 0) this.graceDays = n
    } catch { /* keep default / cached value */ }
  }

  // Fetches the most-recent subscription invoice for this user.
  // Never cached — always a fresh Supabase read so due_date / due_at changes
  // made in super-admin are visible immediately on next load or refresh.
  async _loadLatestInvoice(userId) {
    try {
      const { data } = await supabase
        .from('subscription_invoices')
        .select('id, due_date, due_at, status, amount, period_label, period_start, period_end')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      this.invoice = data || null
    } catch {
      // Non-critical — keep whatever was loaded before (null on first load)
    }
  }

  // ─── Resolution (override > plan feature > safe default) ────────────────

  _resolve(key) {
    const override = this.overrides.get(key)
    if (override) {
      if (override.override_mode === 'add') {
        const base = this.features.get(key) || '0'
        if (base === 'unlimited') return 'unlimited'
        const added = parseInt(base, 10) + parseInt(override.value, 10)
        return String(isNaN(added) ? 0 : added)
      }
      return override.value
    }
    return this.features.get(key) ?? 'false'
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Returns true if the feature toggle is enabled for this user */
  can(featureKey) {
    if (!this.isLoaded) return false // fail-closed: wait for load before granting access
    return this._resolve(featureKey) === 'true'
  }

  /** Returns numeric limit (Infinity for 'unlimited') */
  getLimit(featureKey) {
    if (!this.isLoaded) return 0
    const val = this._resolve(featureKey)
    if (val === 'unlimited') return Infinity
    const n = parseInt(val, 10)
    return isNaN(n) ? 0 : n
  }

  getPlan()     { return this.plan }
  getPlanSlug() { return this.plan?.slug || 'starter' }
  getPlanName() { return this.plan?.name || 'Starter' }
  getPlanColors() { return PLAN_COLORS[this.getPlanSlug()] || PLAN_COLORS.starter }

  isExpired() {
    if (!this.plan?.expires_at) return false
    return new Date(this.plan.expires_at) < new Date()
  }

  getStatus() {
    if (!this.plan) return 'unknown'
    if (this.isExpired()) return 'expired'
    return this.plan.status || 'active'
  }

  // ─── Subscription expiry enforcement ────────────────────────────────────
  // Two-stage: order taking blocks at expires_at; the whole app locks after
  // expires_at + graceDays.

  getGraceDays() { return this.graceDays ?? 7 }

  /** Days until expiry — negative once past. null = no expiry set. */
  daysUntilExpiry() {
    if (!this.plan?.expires_at) return null
    return Math.ceil((new Date(this.plan.expires_at) - new Date()) / 86400000)
  }

  /** Date after which the whole app locks (expiry + grace). */
  getHardLockDate() {
    if (!this.plan?.expires_at) return null
    const d = new Date(this.plan.expires_at)
    d.setDate(d.getDate() + this.getGraceDays())
    return d
  }

  /** Order taking is blocked — subscription expired. */
  isOrderBlocked() {
    return this.isExpired()
  }

  /** The whole app is locked — past the grace period. */
  isAppBlocked() {
    const hard = this.getHardLockDate()
    return hard ? hard < new Date() : false
  }

  /** 'ok' | 'due_soon' | 'order_blocked' | 'app_blocked' */
  getSubscriptionState() {
    if (this.isAppBlocked())   return 'app_blocked'
    if (this.isOrderBlocked()) return 'order_blocked'
    const d = this.daysUntilExpiry()
    if (d !== null && d <= 5)  return 'due_soon'
    return 'ok'
  }

  // ─── Invoice API ────────────────────────────────────────────────────────

  /** Returns the latest subscription_invoices row, or null if none loaded yet. */
  getInvoice() { return this.invoice }

  /**
   * Days until the invoice due_date (negative = overdue, 0 = today, positive = future).
   * Uses local-date arithmetic to avoid UTC-offset surprises on date-only strings.
   * Returns null when only due_at (timestamp) is set — use getInvoiceDueMs() instead.
   */
  getInvoiceDueDays() {
    if (!this.invoice?.due_date) return null
    const s = String(this.invoice.due_date).split('T')[0]          // "YYYY-MM-DD"
    const [y, mo, d] = s.split('-').map(Number)
    const due = new Date(y, mo - 1, d)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.ceil((due - today) / 86400000)
  }

  /**
   * Milliseconds from now until the invoice is due.
   * Positive = time remaining, negative = overdue.
   * Handles both due_at (exact timestamp) and due_date (end-of-day).
   * Returns null if no invoice or no due info.
   */
  getInvoiceDueMs() {
    const inv = this.invoice
    if (!inv) return null
    if (inv.due_at) return new Date(inv.due_at) - Date.now()
    if (inv.due_date) {
      const s = String(inv.due_date).split('T')[0]
      const [y, mo, d] = s.split('-').map(Number)
      return new Date(y, mo - 1, d, 23, 59, 59) - Date.now()
    }
    return null
  }

  /** True when the invoice due is an exact timestamp (due_at), false for date-only. */
  invoiceHasDueAt() {
    return !!this.invoice?.due_at
  }

  /** Human-readable reason why a feature is locked */
  getLockedReason(featureKey) {
    const required = FEATURE_PLAN_MAP[featureKey]
    return required ? `Available on ${required} plan` : 'Not available on your plan'
  }

  /** Clear cache on logout */
  clear() {
    try { localStorage.removeItem(CACHE_KEY) } catch {}
    this.plan      = null
    this.features  = new Map()
    this.overrides = new Map()
    this.isLoaded  = false
    this._cacheHit = false
    this.invoice   = null
  }

  async refresh(userId) {
    this.clear()
    return this.load(userId)
  }
}

// Singleton
export const planManager = new PlanManager()

// React hook — call inside components
export const usePlan = () => planManager