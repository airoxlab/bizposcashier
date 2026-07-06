'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { cacheManager } from '../../lib/cacheManager'
import { authManager } from '../../lib/authManager'
import themeManager from '../../lib/themeManager'
import { Plus, Search, ChevronDown, Check, Image as ImageIcon, X, Loader2, FolderPlus, ArrowLeft, Trash2, Tag, DollarSign, Layers, Settings, Package } from 'lucide-react'
import toast from 'react-hot-toast'

// Full-page "Add Product" form for the POS: Basic info, Pricing & Tax, Product
// Variants, and Display Settings. Intentionally excludes Ingredients and Order
// Inventory (those stay admin-only). Two-column layout so it fits on a POS
// screen without scrolling. Category is a searchable dropdown that can also
// create a new category inline; menu is only asked when creating a NEW category
// AND the business has more than one menu.
//
// IMPORTANT: the product/category/variant user_id is the BUSINESS OWNER's id,
// never the logged-in cashier's staff id. For both roles
// `authManager.getCurrentUser().id` resolves to the owner (cashier login stores
// the owner via the users join), and `cacheManager.userId` is that same owner
// id — the scope all products are fetched under, so a new product shows up.
export default function AddProductModal({ isOpen, onClose, categories = [], menus = [], isDark, onSuccess }) {
  const classes = themeManager.getClasses()

  // Basic info
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imagePreview, setImagePreview] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)

  // Pricing & tax
  const [basePrice, setBasePrice] = useState('')
  const [discount, setDiscount] = useState('')
  const [taxRate, setTaxRate] = useState('')

  // Variants — [{ name, price }]
  const [variants, setVariants] = useState([])

  // Display settings
  const [enableForPos, setEnableForPos] = useState(true)
  const [enableForWeb, setEnableForWeb] = useState(true)
  const [isActive, setIsActive] = useState(true)

  const [saving, setSaving] = useState(false)

  // Category picker
  const [categoryId, setCategoryId] = useState('')
  const [catOpen, setCatOpen] = useState(false)
  const [catQuery, setCatQuery] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatMenuId, setNewCatMenuId] = useState('')

  const fileInputRef = useRef(null)

  const selectedCategory = categories.find(c => c.id === categoryId) || null
  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(catQuery.trim().toLowerCase())
  )

  useEffect(() => {
    if (!isOpen) return
    const def = menus.find(m => m.is_default) || menus[0]
    setNewCatMenuId(def?.id || '')
  }, [isOpen, menus])

  const resetForm = () => {
    setName(''); setDescription('')
    setImageUrl(''); setImagePreview(''); setUploadingImage(false)
    setBasePrice(''); setDiscount(''); setTaxRate('')
    setVariants([])
    setEnableForPos(true); setEnableForWeb(true); setIsActive(true)
    setCategoryId(''); setCatOpen(false); setCatQuery('')
    setCreatingCat(false); setNewCatName('')
  }

  const closeModal = () => {
    if (saving || uploadingImage) return
    resetForm()
    onClose?.()
  }

  const resolveMenuId = () => {
    if (menus.length === 0) return null
    if (menus.length === 1) return menus[0].id
    return newCatMenuId || (menus.find(m => m.is_default) || menus[0])?.id || null
  }

  // ---- Variants ----
  const addVariant = () => setVariants(v => [...v, { name: '', price: '' }])
  const removeVariant = (i) => setVariants(v => v.filter((_, idx) => idx !== i))
  const updateVariant = (i, field, value) =>
    setVariants(v => v.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)))

  // ---- Image ----
  const handleImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return }

    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target.result)
    reader.readAsDataURL(file)

    setUploadingImage(true)
    const uploadToast = toast.loading('Uploading image...')
    try {
      const blob = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = async (ev) => {
          try {
            const img = document.createElement('img')
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = ev.target.result })
            canvas.width = img.width
            canvas.height = img.height
            ctx.drawImage(img, 0, 0)
            canvas.toBlob(resolve, 'image/webp', 0.85)
          } catch (err) { reject(err) }
        }
        r.onerror = reject
        r.readAsDataURL(file)
      })

      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.webp`
      const filePath = `products/${fileName}`
      const { error } = await supabase.storage
        .from('product-images')
        .upload(filePath, blob, { cacheControl: '3600', upsert: false, contentType: 'image/webp' })
      if (error) throw error

      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(filePath)
      setImageUrl(urlData.publicUrl)
      toast.success('Image uploaded', { id: uploadToast })
    } catch (err) {
      console.error('Image upload failed:', err)
      toast.error('Image upload failed: ' + (err.message || err), { id: uploadToast })
      setImagePreview('')
    } finally {
      setUploadingImage(false)
    }
  }

  const removeImage = () => {
    setImageUrl(''); setImagePreview('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ---- Save ----
  const handleSave = async () => {
    if (saving) return

    const ownerId = cacheManager.userId || authManager.getCurrentUser()?.id
    if (!ownerId) { toast.error('Could not resolve your business account'); return }

    if (!name.trim()) { toast.error('Enter a product name'); return }
    const priceNum = parseFloat(basePrice)
    if (isNaN(priceNum) || priceNum < 0) { toast.error('Enter a valid base price'); return }

    if (creatingCat) {
      if (!newCatName.trim()) { toast.error('Enter a category name'); return }
    } else if (!categoryId) {
      toast.error('Select or create a category'); return
    }

    const cleanVariants = variants
      .map(v => ({ name: (v.name || '').trim(), price: v.price }))
      .filter(v => v.name || (v.price !== '' && v.price != null))
    for (const v of cleanVariants) {
      if (!v.name) { toast.error('Every variant needs a name'); return }
      const vp = parseFloat(v.price)
      if (isNaN(vp) || vp < 0) { toast.error(`Enter a valid price for variant "${v.name}"`); return }
    }

    setSaving(true)
    try {
      let finalCategoryId = categoryId
      let createdCategory = null

      if (creatingCat) {
        const { data: cat, error: catErr } = await supabase
          .from('categories')
          .insert({
            user_id: ownerId,
            menu_id: resolveMenuId(),
            name: newCatName.trim(),
            enable_for_pos: true,
            enable_for_web: true,
            sort_order: categories.length,
          })
          .select()
          .single()
        if (catErr) throw catErr
        createdCategory = cat
        finalCategoryId = cat.id
      }

      const { data: product, error: prodErr } = await supabase
        .from('products')
        .insert({
          user_id: ownerId,
          category_id: finalCategoryId,
          name: name.trim(),
          description: description.trim() || null,
          image_url: imageUrl || null,
          base_price: priceNum,
          discount_percentage: parseFloat(discount) || 0,
          tax_rate: parseFloat(taxRate) || 0,
          is_active: isActive,
          enable_for_pos: enableForPos,
          enable_for_web: enableForWeb,
        })
        .select()
        .single()
      if (prodErr) throw prodErr

      let insertedVariants = []
      if (cleanVariants.length > 0) {
        const rows = cleanVariants.map((v, i) => ({
          product_id: product.id,
          user_id: ownerId,
          name: v.name,
          price: parseFloat(v.price) || 0,
          sort_order: i,
        }))
        const { data: vData, error: vErr } = await supabase
          .from('product_variants')
          .insert(rows)
          .select()
        if (vErr) throw vErr
        insertedVariants = vData || []
      }

      toast.success('Product added')
      onSuccess?.(product, createdCategory, insertedVariants)
      resetForm()
      onClose?.()
    } catch (err) {
      console.error('Add product failed:', err)
      toast.error('Failed to add product: ' + (err.message || err))
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || typeof document === 'undefined') return null

  // Tailwind v4 dropped the `placeholder-gray-400` shorthand that themeManager's
  // `input` class uses, so placeholders were inheriting the text color and
  // looked like real values. Force a muted placeholder with the v4 variant.
  const phCls = 'placeholder:text-gray-400 placeholder:font-normal'
  const inputCls = `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${classes.input} ${phCls} focus:ring-2 focus:ring-green-500`
  const labelCls = `block text-xs font-medium mb-1.5 ${classes.textSecondary}`
  const sectionCard = `rounded-2xl border ${classes.border} ${classes.card} p-4`

  const SectionTitle = ({ icon: Icon, children, right }) => (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-green-600" />
        <span className={`text-xs font-bold uppercase tracking-wider ${classes.textSecondary}`}>{children}</span>
      </div>
      {right}
    </div>
  )

  const Toggle = ({ label, sublabel, checked, onToggle }) => (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center justify-between gap-2 p-3 rounded-xl border ${classes.border} ${checked ? 'ring-1 ring-green-500/40' : ''} ${classes.hover}`}
    >
      <div className="text-left">
        <p className={`text-sm font-semibold ${classes.textPrimary}`}>{label}</p>
        {sublabel && <p className={`text-[11px] ${classes.textSecondary}`}>{sublabel}</p>}
      </div>
      <span className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${checked ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )

  return createPortal(
    <div className={`fixed inset-0 z-[70] flex flex-col ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold leading-tight">Add New Product</h2>
            <p className="text-xs text-white/80">Fill in the details below</p>
          </div>
        </div>
        <button
          onClick={closeModal}
          disabled={saving || uploadingImage}
          className="p-2 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto p-5">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* ── Left column ── */}
          <div className="space-y-5">
            {/* Category */}
            <div className={sectionCard}>
              <SectionTitle icon={Tag}>Category *</SectionTitle>

              {creatingCat ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FolderPlus className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <input
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="New category name"
                      className={inputCls}
                      autoFocus
                    />
                  </div>

                  {menus.length > 1 && (
                    <div>
                      <label className={labelCls}>Menu</label>
                      <select
                        value={newCatMenuId}
                        onChange={(e) => setNewCatMenuId(e.target.value)}
                        className={inputCls}
                      >
                        {menus.map(m => (
                          <option key={m.id} value={m.id}>{m.name}{m.is_default ? ' (default)' : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => { setCreatingCat(false); setNewCatName('') }}
                    className={`inline-flex items-center gap-1 text-xs ${classes.textSecondary} hover:underline`}
                  >
                    <ArrowLeft className="w-3 h-3" /> Choose an existing category instead
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCatOpen(o => !o)}
                    className={`${inputCls} flex items-center justify-between text-left`}
                  >
                    <span className={selectedCategory ? classes.textPrimary : 'text-gray-400'}>
                      {selectedCategory ? selectedCategory.name : 'Select a category'}
                    </span>
                    <ChevronDown className={`w-4 h-4 ${classes.textSecondary}`} />
                  </button>

                  {catOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setCatOpen(false)} />
                      <div className={`absolute z-50 mt-1 w-full rounded-xl border ${classes.border} ${classes.card} ${classes.shadow} max-h-64 overflow-auto`}>
                        <div className={`sticky top-0 p-2 ${classes.card} border-b ${classes.border}`}>
                          <div className="relative">
                            <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 ${classes.textSecondary}`} />
                            <input
                              value={catQuery}
                              onChange={(e) => setCatQuery(e.target.value)}
                              placeholder="Search categories..."
                              autoFocus
                              className={`w-full pl-8 pr-2 py-2 rounded-lg border text-sm outline-none ${classes.input} ${phCls}`}
                            />
                          </div>
                        </div>

                        {filteredCategories.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setCategoryId(c.id); setCatOpen(false); setCatQuery('') }}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${classes.hover} ${classes.textPrimary}`}
                          >
                            {c.name}
                            {categoryId === c.id && <Check className="w-4 h-4 text-green-600" />}
                          </button>
                        ))}
                        {filteredCategories.length === 0 && (
                          <div className={`px-3 py-2 text-sm ${classes.textSecondary}`}>No matching categories</div>
                        )}

                        <button
                          type="button"
                          onClick={() => { setCreatingCat(true); setNewCatName(catQuery); setCatOpen(false) }}
                          className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 border-t ${classes.border} text-green-600 font-medium ${classes.hover}`}
                        >
                          <FolderPlus className="w-4 h-4" />
                          {catQuery.trim() ? `Create "${catQuery.trim()}"` : 'Add new category'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Basic Information */}
            <div className={sectionCard}>
              <SectionTitle icon={ImageIcon}>Basic Information</SectionTitle>

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="sm:w-40 flex-shrink-0">
                  {imagePreview || imageUrl ? (
                    <div className={`relative w-full h-40 rounded-xl overflow-hidden border ${classes.border}`}>
                      <img src={imagePreview || imageUrl} alt="preview" className="w-full h-full object-cover" />
                      {uploadingImage && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-white animate-spin" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={removeImage}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`w-full h-40 rounded-xl border-2 border-dashed ${classes.border} flex flex-col items-center justify-center gap-1 ${classes.textSecondary} ${classes.hover}`}
                    >
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-xs text-center px-2">Upload image (optional)</span>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                </div>

                <div className="flex-1 space-y-3">
                  <div>
                    <label className={labelCls}>Product Name *</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Chicken Burger"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="Optional short description"
                      className={`${inputCls} resize-none`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-5">
            {/* Pricing & Tax */}
            <div className={sectionCard}>
              <SectionTitle icon={DollarSign}>Pricing &amp; Tax</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Base Price (Rs) *</label>
                  <input type="number" min="0" step="0.01" value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)} placeholder="0.00" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Discount (%)</label>
                  <input type="number" min="0" max="100" step="0.01" value={discount}
                    onChange={(e) => setDiscount(e.target.value)} placeholder="0" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Tax Rate (%)</label>
                  <input type="number" min="0" step="0.01" value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)} placeholder="0" className={inputCls} />
                </div>
              </div>
            </div>

            {/* Product Variants */}
            <div className={sectionCard}>
              <SectionTitle
                icon={Layers}
                right={
                  <button
                    type="button"
                    onClick={addVariant}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-700"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Variant
                  </button>
                }
              >
                Product Variants
              </SectionTitle>

              {variants.length === 0 ? (
                <p className={`text-xs ${classes.textSecondary}`}>
                  Optional. Add sizes/options (e.g. Small, Medium, Large) — each with its own price.
                </p>
              ) : (
                <div className="space-y-2">
                  {variants.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={v.name}
                        onChange={(e) => updateVariant(i, 'name', e.target.value)}
                        placeholder="Variant name (e.g. Large)"
                        className={`${inputCls} flex-1`}
                      />
                      <div className="relative w-32 flex-shrink-0">
                        <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-xs ${classes.textSecondary}`}>Rs</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={v.price}
                          onChange={(e) => updateVariant(i, 'price', e.target.value)}
                          placeholder="0.00"
                          className={`${inputCls} pl-7`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeVariant(i)}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 flex-shrink-0"
                        title="Remove variant"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Display Settings */}
            <div className={sectionCard}>
              <SectionTitle icon={Settings}>Display Settings</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Toggle label="Enable for POS" sublabel="Show in this POS" checked={enableForPos} onToggle={() => setEnableForPos(v => !v)} />
                <Toggle label="Enable for Web" sublabel="Website catalog" checked={enableForWeb} onToggle={() => setEnableForWeb(v => !v)} />
                <Toggle label="Active" sublabel="Available to sell" checked={isActive} onToggle={() => setIsActive(v => !v)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={`flex-shrink-0 border-t ${classes.border} ${classes.card} px-6 py-4`}>
        <div className="max-w-6xl mx-auto flex gap-3 justify-end">
          <button
            type="button"
            onClick={closeModal}
            disabled={saving || uploadingImage}
            className={`px-6 py-3 rounded-xl border text-sm font-medium ${classes.button} disabled:opacity-50`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploadingImage}
            className="px-8 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
