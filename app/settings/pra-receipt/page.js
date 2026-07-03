'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt, Save, RefreshCw, Building2, ShieldCheck, AlignLeft,
  Loader2, Info, Lock, FileText, Stamp,
} from 'lucide-react'
import themeManager from '../../../lib/themeManager'
import { authManager } from '../../../lib/authManager'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

// Columns + defaults. Mirrors migration 025 — two independent groups.
const PROFORMA_DEFAULTS = {
  proforma_show_company_logo: true,
  proforma_show_company_name: true,
  proforma_show_company_info: true,
  proforma_show_footer: true,
  proforma_footer_note: '',
}

const PRA_DEFAULTS = {
  pra_receipt_show_company_logo: true,
  pra_receipt_show_company_name: true,
  pra_receipt_show_company_info: true,
  pra_receipt_show_pra_logo: true,
  pra_receipt_show_invoice_details: true,
  pra_receipt_show_pra_qr: true,
  pra_receipt_show_verify_text: true,
  pra_receipt_show_footer: true,
  pra_receipt_footer_note: '',
}

const DEFAULTS = { ...PROFORMA_DEFAULTS, ...PRA_DEFAULTS }
const NOTE_KEYS = new Set(['proforma_footer_note', 'pra_receipt_footer_note'])
const ALL_COLUMNS = Object.keys(DEFAULTS).join(', ')

// ─── Toggle (matches the settings design language) ───────────────────────────
const Toggle = ({ checked, onChange, disabled = false }) => (
  <button
    type="button"
    onClick={onChange}
    disabled={disabled}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
      checked ? 'bg-purple-500' : 'bg-gray-600'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
)

export function PraReceiptPanel() {
  const isDark = themeManager.isDark()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [praEnabled, setPraEnabled] = useState(null)
  const [hasRow, setHasRow] = useState(false)
  const [settings, setSettings] = useState(DEFAULTS)
  const [activeForm, setActiveForm] = useState('proforma') // 'proforma' | 'pra'

  const userId = authManager.getCurrentUser()?.id || null

  const fetchSettings = async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('pra_settings')
        .select(`is_enabled, ${ALL_COLUMNS}`)
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      if (data) {
        setHasRow(true)
        setPraEnabled(data.is_enabled === true)
        const next = { ...DEFAULTS }
        for (const key of Object.keys(DEFAULTS)) {
          if (NOTE_KEYS.has(key)) next[key] = data[key] || ''
          else next[key] = data[key] !== false // default true
        }
        setSettings(next)
      } else {
        setHasRow(false)
        setPraEnabled(false)
        setSettings(DEFAULTS)
      }
    } catch (err) {
      // Supabase/PostgREST errors log as an opaque {} — surface the real fields.
      const msg = err?.message || err?.code || (err ? JSON.stringify(err) : 'unknown error')
      console.error('[PRA Receipt Settings] load error:', msg, err?.code || '', err)
      // 42703 = "column does not exist" → the DB migration hasn't been applied.
      if (err?.code === '42703') {
        toast.error('PRA receipt settings need a database update — ask your admin to run migration 025.')
      } else {
        toast.error('Failed to load receipt settings: ' + msg)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (key) => setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  const setNote = (key, val) => setSettings((prev) => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    if (!userId) { toast.error('No active user'); return }
    if (!hasRow) {
      toast.error('Enable PRA fiscalization first (Admin → PRA settings) before configuring its receipts.')
      return
    }
    setSaving(true)
    const id = toast.loading('Saving receipt settings...')
    try {
      const payload = { ...settings, updated_at: new Date().toISOString() }
      for (const key of NOTE_KEYS) payload[key] = settings[key]?.trim() || null
      const { error } = await supabase
        .from('pra_settings')
        .update(payload)
        .eq('user_id', userId)
      if (error) throw error
      toast.success('Receipt settings saved', { id })
    } catch (err) {
      console.error('[PRA Receipt Settings] save error:', err)
      toast.error('Failed to save: ' + (err.message || 'unknown error'), { id })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    )
  }

  const TABS = [
    { key: 'proforma', label: 'Proforma Configuration', icon: FileText },
    { key: 'pra',      label: 'PRA Configuration',      icon: Stamp },
  ]

  return (
    <div className="rounded-2xl overflow-hidden">
      {/* ── Header + Save row ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Receipt size={18} className="text-white" />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>PRA Receipt Settings</h3>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Configure the Proforma & PRA fiscal invoices independently</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchSettings}
            disabled={saving}
            title="Reset to saved values"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-all disabled:opacity-50 ${
              isDark ? 'border-gray-700/50 text-gray-300 hover:bg-gray-700/50' : 'border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save Settings
          </button>
        </div>
      </div>

      {/* ── Info banner ── */}
      <div className={`flex items-start gap-3 p-4 rounded-2xl border mb-6 ${isDark ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-indigo-50 border-indigo-200'}`}>
        <Info size={18} className={`flex-shrink-0 mt-0.5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
        <div>
          <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Two separate layouts</p>
          <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            The Proforma preview and the filed PRA tax invoice are configured separately, so you can
            show the company logo on one but hide it on the other. These settings do not affect your
            normal customer receipt.
          </p>
        </div>
      </div>

      {/* ── PRA disabled banner ── */}
      {praEnabled === false && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border mb-6 ${isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
          <Lock size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className={`text-sm font-semibold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>PRA fiscalization is currently off</p>
            <p className={`text-xs mt-1 ${isDark ? 'text-amber-400/70' : 'text-amber-600'}`}>
              You can still configure the layouts below. The Proforma and PRA buttons only appear on
              orders once PRA is enabled in your PRA settings.
            </p>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className={`flex items-center gap-1 p-1 rounded-2xl border mb-6 ${isDark ? 'bg-gray-800/60 border-gray-700/50' : 'bg-gray-100 border-gray-200'}`}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveForm(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeForm === tab.key
                ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/20'
                : isDark
                  ? 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
            }`}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeForm === 'proforma' ? (
          <motion.div key="proforma" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-5">
            <ToggleCard isDark={isDark} icon={Building2} title="Header" subtitle="Top of the proforma invoice">
              <ToggleRow isDark={isDark} checked={settings.proforma_show_company_logo} onChange={() => toggle('proforma_show_company_logo')} label="Show Company Logo" description="Print your business logo at the top" />
              <Divider isDark={isDark} />
              <ToggleRow isDark={isDark} checked={settings.proforma_show_company_name} onChange={() => toggle('proforma_show_company_name')} label="Show Company Name" description="Print your business name" />
              <Divider isDark={isDark} />
              <ToggleRow isDark={isDark} checked={settings.proforma_show_company_info} onChange={() => toggle('proforma_show_company_info')} label="Show Company Info" description="Print address & phone numbers" />
            </ToggleCard>

            <ToggleCard isDark={isDark} icon={AlignLeft} title="Footer" subtitle="Bottom of the proforma invoice">
              <ToggleRow isDark={isDark} checked={settings.proforma_show_footer} onChange={() => toggle('proforma_show_footer')} label="Show Footer Section" description="Business QR, review message & hashtags" />
              <Divider isDark={isDark} />
              <NoteField isDark={isDark} value={settings.proforma_footer_note} onChange={(v) => setNote('proforma_footer_note', v)} label="Custom Footer Note" />
            </ToggleCard>
          </motion.div>
        ) : (
          <motion.div key="pra" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-5">
            <ToggleCard isDark={isDark} icon={Building2} title="Header" subtitle="Top of the PRA fiscal invoice">
              <ToggleRow isDark={isDark} checked={settings.pra_receipt_show_company_logo} onChange={() => toggle('pra_receipt_show_company_logo')} label="Show Company Logo" description="Print your business logo at the top" />
              <Divider isDark={isDark} />
              <ToggleRow isDark={isDark} checked={settings.pra_receipt_show_company_name} onChange={() => toggle('pra_receipt_show_company_name')} label="Show Company Name" description="Print your business name" />
              <Divider isDark={isDark} />
              <ToggleRow isDark={isDark} checked={settings.pra_receipt_show_company_info} onChange={() => toggle('pra_receipt_show_company_info')} label="Show Company Info" description="Print address & phone numbers" />
            </ToggleCard>

            <ToggleCard isDark={isDark} icon={ShieldCheck} title="PRA Fiscal Block" subtitle="The official tax-invoice section">
              <ToggleRow isDark={isDark} checked={settings.pra_receipt_show_pra_logo} onChange={() => toggle('pra_receipt_show_pra_logo')} label="Show PRA Logo" description="Print the official Punjab Revenue Authority logo" />
              <Divider isDark={isDark} />
              <ToggleRow isDark={isDark} checked={settings.pra_receipt_show_invoice_details} onChange={() => toggle('pra_receipt_show_invoice_details')} label="Show Fiscal Invoice Details" description="Fiscal invoice number, taxable amount & tax breakdown" />
              <Divider isDark={isDark} />
              <ToggleRow isDark={isDark} checked={settings.pra_receipt_show_pra_qr} onChange={() => toggle('pra_receipt_show_pra_qr')} label="Show PRA Verification QR" description="Print the scannable PRA QR code" />
              <Divider isDark={isDark} />
              <ToggleRow isDark={isDark} checked={settings.pra_receipt_show_verify_text} onChange={() => toggle('pra_receipt_show_verify_text')} label='Show "Scan to verify at PRA"' description="Print the verification helper line under the QR" />
            </ToggleCard>

            <ToggleCard isDark={isDark} icon={AlignLeft} title="Footer" subtitle="Bottom of the PRA fiscal invoice">
              <ToggleRow isDark={isDark} checked={settings.pra_receipt_show_footer} onChange={() => toggle('pra_receipt_show_footer')} label="Show Footer Section" description="Business QR, review message & hashtags" />
              <Divider isDark={isDark} />
              <NoteField isDark={isDark} value={settings.pra_receipt_footer_note} onChange={(v) => setNote('pra_receipt_footer_note', v)} label="Custom Footer Note" />
            </ToggleCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Building blocks ─────────────────────────────────────────────────────────
function ToggleCard({ isDark, icon: Icon, title, subtitle, children }) {
  return (
    <div className={`rounded-2xl border ${isDark ? 'border-gray-700/50 bg-gray-800/60' : 'border-gray-200 bg-white'} overflow-hidden`}>
      <div className={`flex items-center gap-3 px-4 py-3 border-b ${isDark ? 'border-gray-700/50 bg-gray-800/40' : 'border-gray-200 bg-gray-50'}`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-purple-500/15' : 'bg-purple-100'}`}>
          <Icon size={16} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
        </div>
        <div>
          <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{title}</p>
          {subtitle && <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{subtitle}</p>}
        </div>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  )
}

function ToggleRow({ isDark, checked, onChange, label, description, disabled = false }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1 mr-4">
        <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{label}</p>
        {description && <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

function Divider({ isDark }) {
  return <div className={`border-t ${isDark ? 'border-gray-700/50' : 'border-gray-200'}`} />
}

function NoteField({ isDark, value, onChange, label }) {
  return (
    <div>
      <label className={`block text-sm font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={200}
        placeholder="e.g. Thank you for shopping with us."
        className={`w-full px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
          isDark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
        }`}
      />
      <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Printed at the bottom. Leave blank to hide.</p>
    </div>
  )
}

// Default export so the route /settings/pra-receipt is also directly reachable.
export default function PraReceiptSettingsPage() {
  return <PraReceiptPanel />
}
