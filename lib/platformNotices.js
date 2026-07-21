// lib/platformNotices.js
// Singleton — mirrors the planManager pattern.
// Loads platform-wide notices (maintenance locks + announcement banners) that
// the super-admin publishes, via the get_active_notices() RPC. Caches to
// localStorage so it paints instantly and survives refreshes / offline boots.
//
// Components subscribe to the 'platformnotices:loaded' window event (same
// convention as planManager) and re-read getMaintenance() / getBanners().
//
// Offline-first: a failed fetch never NEWLY locks the POS, and going offline
// drops any cached maintenance block so the cashier can keep working.

import { supabase } from '@/lib/supabase'

const APP       = 'cashier'
const CACHE_KEY = 'bizpos_platform_notices'
const CACHE_TTL = 6 * 60 * 60 * 1000
const POLL_MS   = 60 * 1000

class PlatformNotices {
  constructor(app) {
    this.app      = app
    this.notices  = []
    this.userId   = null
    this.isLoaded = false
    this._timer   = null
    this._channel = null
    this._started = false
    if (typeof window !== 'undefined') this._hydrate()
  }

  // Owner (business) users.id from the cached cashier/admin session.
  _readOwnerId() {
    try { return JSON.parse(localStorage.getItem('user') || '{}')?.id || null }
    catch { return null }
  }

  _hydrate() {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return
      const { notices, userId, cachedAt } = JSON.parse(raw)
      if (Date.now() - cachedAt > CACHE_TTL) return
      this.notices  = notices || []
      this.userId   = userId ?? null
      this.isLoaded = true
    } catch {}
  }

  _save() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        notices: this.notices, userId: this.userId, cachedAt: Date.now(),
      }))
    } catch {}
  }

  _emit() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('platformnotices:loaded'))
    }
  }

  async load() {
    try {
      const { data, error } = await supabase.rpc('get_active_notices', {
        p_app: this.app,
        p_user_id: this.userId,
      })
      if (error) throw error
      this.notices  = data || []
      this.isLoaded = true
      this._save()
      this._emit()
      return true
    } catch {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.notices = this.notices.filter((n) => n.kind !== 'maintenance')
      }
      this.isLoaded = true
      this._emit()
      return false
    }
  }

  // Push updates: re-fetch the instant any notice row changes. Poll stays as a
  // fallback for missed events / reconnects.
  _subscribeRealtime() {
    if (this._channel || typeof window === 'undefined') return
    try {
      this._channel = supabase
        .channel('platform-notices-rt')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'platform_notices' },
          () => this.load()
        )
        .subscribe()
    } catch {}
  }

  start() {
    if (this._started) return
    this._started = true
    this.userId = this._readOwnerId()
    this.load()
    this._subscribeRealtime()
    this._timer = setInterval(() => {
      const uid = this._readOwnerId()
      if (uid !== this.userId) this.userId = uid
      this.load()
    }, POLL_MS)
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.load())
      // Login/logout refreshes the plan → also re-target notices to the new user.
      window.addEventListener('planmanager:loaded', () => this.setUser(this._readOwnerId()))
    }
  }

  setUser(userId) {
    const uid = userId ?? null
    if (uid === this.userId && this.isLoaded) return
    this.userId = uid
    this.load()
  }

  getMaintenance() { return this.notices.find((n) => n.kind === 'maintenance') || null }
  getBanners()     { return this.notices.filter((n) => n.kind === 'banner') }
}

export const platformNotices = new PlatformNotices(APP)
