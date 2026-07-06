'use client'

import { Plus, Coffee, Search, X, BarChart2, Star, GripVertical, Check } from 'lucide-react'
import { useRef, forwardRef, useImperativeHandle, useMemo, useState, useEffect } from 'react'
import { cacheManager } from '../../lib/cacheManager'
import CashierAnalytics from '../pos/CashierAnalytics'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Compact draggable product card shown only in POS "Arrange" mode. The whole
// card is the drag handle (touch-friendly); no add-to-cart / favorite actions
// so a cashier can't fat-finger them while reordering.
function SortableProductCard({ product, index, classes, isDark }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative ${classes.card} rounded-xl ${classes.border} border-2 border-dashed border-green-500/60
        cursor-grab active:cursor-grabbing touch-none select-none overflow-hidden`}
    >
      <div className="absolute top-1.5 left-1.5 z-10 min-w-[1.4rem] h-6 px-1.5 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center shadow">
        {index + 1}
      </div>
      <div className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-black/45 flex items-center justify-center">
        <GripVertical className="w-4 h-4 text-white" />
      </div>
      <div className={`relative aspect-square ${isDark ? 'bg-gray-700' : 'bg-gray-100'} overflow-hidden`}>
        {product.image_url ? (
          <img
            src={cacheManager.getImageUrl(product.image_url)}
            alt={product.name}
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <div className={`flex items-center justify-center h-full p-2 ${isDark ? 'bg-gradient-to-br from-gray-700 to-gray-600' : 'bg-gradient-to-br from-gray-200 to-gray-300'}`}>
            <span className={`text-sm font-bold text-center leading-tight break-words line-clamp-4 ${isDark ? 'text-white' : 'text-gray-700'}`}>
              {product.name}
            </span>
          </div>
        )}
      </div>
      <div className="p-2">
        <h3 className={`font-bold ${classes.textPrimary} text-sm truncate`}>
          {product.name}
        </h3>
        <span className="text-xs font-semibold text-green-600 dark:text-green-400">
          Rs {product.base_price}
        </span>
      </div>
    </div>
  )
}

const ProductGrid = forwardRef(({
  categories = [],
  deals = [],
  allProducts = [],
  onProductClick,
  onDealClick,
  onToggleFavorite,
  onAddProduct,
  onReorderProducts,
  classes,
  isDark,
  networkStatus,
  selectedCategoryId = null,
  headerCenter = null
}, ref) => {
  const productRefs = useRef({})
  const dealRef = useRef(null)
  const favoritesRef = useRef(null)
  const searchInputRef = useRef(null)
  const gridContainerRef = useRef(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAnalytics, setShowAnalytics] = useState(false)
  // "Arrange" mode: turns each category's grid into a drag-to-reorder surface
  // that writes products.sort_order (shared with admin). Off by default so a
  // cashier taps to add to cart as usual until they opt in.
  const [arrangeMode, setArrangeMode] = useState(false)

  // Touch + mouse + keyboard drag sensors. The small activation distance means
  // a tap still registers as a tap (add-to-cart) and only a deliberate drag
  // starts a reorder.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Auto-focus search on mount
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  // Fast scroll — multiply wheel delta so the list scrolls further per notch
  useEffect(() => {
    const el = gridContainerRef.current
    if (!el) return
    const onWheel = (e) => {
      if (e.deltaY === 0) return
      e.preventDefault()
      el.scrollTop += e.deltaY * 2.5
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Memoize category→products mapping so it's not recomputed on every render.
  // Each bucket is sorted by manual sort_order (name as tie-breaker) so the grid
  // reflects the owner's arrangement regardless of the cache array order.
  const productsByCategory = useMemo(() => {
    const map = {}
    for (const product of allProducts) {
      if (!map[product.category_id]) map[product.category_id] = []
      map[product.category_id].push(product)
    }
    for (const key in map) {
      map[key].sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          (a.name || '').localeCompare(b.name || '')
      )
    }
    return map
  }, [allProducts])

  const visibleProductCount = useMemo(
    () => allProducts.length,
    [allProducts]
  )

  // Favorites — the virtual "⭐ Favorites" section pinned at the top of the grid.
  const favoriteProducts = useMemo(
    () => allProducts.filter(p => p.is_favorite),
    [allProducts]
  )
  const favoriteDeals = useMemo(
    () => (deals || []).filter(d => d.is_favorite),
    [deals]
  )
  const hasFavorites = favoriteProducts.length > 0 || favoriteDeals.length > 0

  // Filtered results when search is active
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return null
    const matchedProducts = allProducts.filter(p => p.name.toLowerCase().includes(q))
    const matchedDeals = (deals || []).filter(d => d.name.toLowerCase().includes(q))
    return { products: matchedProducts, deals: matchedDeals }
  }, [searchQuery, allProducts, deals])

  // Fast custom smooth scroll — 200ms ease-out, no native sluggishness
  const smoothScrollToElement = (element) => {
    let scrollParent = element.parentElement
    while (scrollParent) {
      const { overflowY } = window.getComputedStyle(scrollParent)
      if (overflowY === 'auto' || overflowY === 'scroll') break
      scrollParent = scrollParent.parentElement
    }
    if (!scrollParent) return
    const targetTop = element.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top + scrollParent.scrollTop - 8
    const startTop = scrollParent.scrollTop
    const distance = targetTop - startTop
    const duration = 200
    let startTime = null
    const easeOut = (t) => 1 - Math.pow(1 - t, 3)
    const step = (timestamp) => {
      if (!startTime) startTime = timestamp
      const elapsed = Math.min((timestamp - startTime) / duration, 1)
      scrollParent.scrollTop = startTop + distance * easeOut(elapsed)
      if (elapsed < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  // Expose scroll/focus methods to parent component
  useImperativeHandle(ref, () => ({
    scrollToCategory: (categoryId) => {
      const element = productRefs.current[categoryId]
      if (!element) return
      smoothScrollToElement(element)
    },
    scrollToDeals: () => {
      if (dealRef.current) smoothScrollToElement(dealRef.current)
    },
    scrollToFavorites: () => {
      if (favoritesRef.current) smoothScrollToElement(favoritesRef.current)
    },
    focusSearch: () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
  }))

  // Keyboard navigation: ArrowDown from search → first card
  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const firstCard = gridContainerRef.current?.querySelector('[data-kb-card]')
      firstCard?.focus()
    }
  }

  // Keyboard navigation on product/deal cards
  const handleCardKeyDown = (e, clickHandler) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      clickHandler()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      searchInputRef.current?.focus()
      return
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const cards = [...gridContainerRef.current.querySelectorAll('[data-kb-card]')]
      const idx = cards.indexOf(e.currentTarget)
      if (idx < cards.length - 1) cards[idx + 1].focus()
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const cards = [...gridContainerRef.current.querySelectorAll('[data-kb-card]')]
      const idx = cards.indexOf(e.currentTarget)
      if (idx > 0) cards[idx - 1].focus()
      else searchInputRef.current?.focus()
      return
    }
    // Any printable character → focus search and append
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      searchInputRef.current?.focus()
      setSearchQuery(prev => prev + e.key)
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    searchInputRef.current?.focus()
  }

  const isSearchActive = searchQuery.trim().length > 0

  // Searching and arranging don't mix (search spans categories); exit arrange
  // if a search starts so the two modes never fight.
  useEffect(() => {
    if (arrangeMode && isSearchActive) setArrangeMode(false)
  }, [arrangeMode, isSearchActive])

  // Persist a category reorder: compute the new id order after the drop and
  // hand it to the parent (which updates the cache + Supabase). Constrained to
  // one category because each category renders its own SortableContext.
  const handleCategoryDragEnd = (event, categoryId, categoryProducts) => {
    const { active, over } = event
    if (!over || active.id === over.id || !onReorderProducts) return
    const oldIndex = categoryProducts.findIndex(p => p.id === active.id)
    const newIndex = categoryProducts.findIndex(p => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const orderedIds = arrayMove(categoryProducts, oldIndex, newIndex).map(p => p.id)
    onReorderProducts(categoryId, orderedIds)
  }

  // Small star overlay button, reused on every product/deal card. Toggles the
  // shared favorite flag; stopPropagation so it doesn't add the item to cart.
  const renderFavStar = (item, type) =>
    onToggleFavorite ? (
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(item, type) }}
        title={item.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
        className="absolute top-2 right-2 z-20 w-7 h-7 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center transition-colors"
      >
        <Star className={`w-4 h-4 ${item.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-white'}`} />
      </button>
    ) : null

  // Single source of truth for a product card — used by the category,
  // favorites, and search sections so the markup (and the star) stays in sync.
  const renderProductCard = (product) => (
    <div
      key={product.id}
      data-kb-card="true"
      tabIndex={0}
      onClick={() => onProductClick(product)}
      onKeyDown={(e) => handleCardKeyDown(e, () => onProductClick(product))}
      className={`${classes.card} rounded-xl ${classes.shadow} shadow-lg cursor-pointer overflow-hidden group ${classes.border} border
        transition-all duration-200 ease-out
        hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl
        active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-green-500`}
    >
      <div className={`relative aspect-square ${isDark ? 'bg-gray-700' : 'bg-gray-100'} overflow-hidden`}>
        {product.image_url ? (
          <img
            src={cacheManager.getImageUrl(product.image_url)}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className={`flex items-center justify-center h-full p-2 ${isDark ? 'bg-gradient-to-br from-gray-700 to-gray-600' : 'bg-gradient-to-br from-gray-200 to-gray-300'}`}>
            <span className={`text-sm font-bold text-center leading-tight break-words line-clamp-4 ${isDark ? 'text-white' : 'text-gray-700'}`}>
              {product.name}
            </span>
          </div>
        )}

        {renderFavStar(product, 'product')}

        <div className="absolute top-2 left-2 flex flex-col items-start gap-0.5">
          {product.discount_percentage > 0 ? (
            <>
              <div className="bg-green-600 text-white px-2 py-0.5 rounded-full text-xs font-bold shadow-lg">
                Rs {Math.round(product.base_price * (1 - product.discount_percentage / 100))}
              </div>
              <div className="bg-black/55 text-white/80 px-2 py-0.5 rounded-full text-[9px] font-semibold line-through shadow">
                Rs {product.base_price}
              </div>
            </>
          ) : (
            <div className="bg-green-600 text-white px-2 py-1 rounded-full text-xs font-bold shadow-lg">
              Rs {product.base_price}
            </div>
          )}
        </div>

        <div className={`absolute bottom-2 right-2 w-8 h-8 ${classes.card} rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200`}>
          <Plus className="w-4 h-4 text-green-600" />
        </div>
      </div>

      <div className="p-2">
        <h3 className={`font-bold ${classes.textPrimary} text-sm mb-1 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors truncate`}>
          {product.name}
        </h3>
        {product.ingredients && (
          <p className={`${classes.textSecondary} text-xs truncate`}>
            {product.ingredients}
          </p>
        )}
      </div>
    </div>
  )

  // Single source of truth for a deal card.
  const renderDealCard = (deal) => (
    <div
      key={deal.id}
      data-kb-card="true"
      tabIndex={deal.isOutOfTime ? -1 : 0}
      onClick={() => !deal.isOutOfTime && onDealClick(deal)}
      onKeyDown={(e) => !deal.isOutOfTime && handleCardKeyDown(e, () => onDealClick(deal))}
      className={`${classes.card} rounded-xl ${classes.shadow} shadow-lg overflow-hidden group ${classes.border} border
        ${deal.isOutOfTime
          ? 'cursor-not-allowed opacity-70'
          : `cursor-pointer transition-all duration-200 ease-out
             hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl
             active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-green-500`
        }`}
    >
      <div className={`relative aspect-square ${isDark ? 'bg-gray-700' : 'bg-gray-100'} overflow-hidden`}>
        {deal.image_url ? (
          <img
            src={cacheManager.getImageUrl(deal.image_url)}
            alt={deal.name}
            className={`w-full h-full object-cover ${!deal.isOutOfTime && 'group-hover:scale-105'} transition-transform duration-300 ${deal.isOutOfTime ? 'grayscale' : ''}`}
          />
        ) : (
          <div className={`flex items-center justify-center h-full p-2 ${isDark ? 'bg-gradient-to-br from-gray-700 to-gray-600' : 'bg-gradient-to-br from-gray-200 to-gray-300'}`}>
            <span className={`text-sm font-bold text-center leading-tight break-words line-clamp-4 ${isDark ? 'text-white' : 'text-gray-700'}`}>
              {deal.name}
            </span>
          </div>
        )}

        {deal.isOutOfTime && (
          <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center">
            <div className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg transform -rotate-12">
              OUT OF TIME
            </div>
          </div>
        )}

        {renderFavStar(deal, 'deal')}

        <div className={`absolute top-2 left-2 ${deal.isOutOfTime ? 'bg-gray-600' : 'bg-green-600'} text-white px-2 py-1 rounded-full text-xs font-bold shadow-lg`}>
          Rs {deal.price}
        </div>

        {!deal.isOutOfTime && (
          <div className={`absolute bottom-2 right-2 w-8 h-8 ${classes.card} rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200`}>
            <Plus className="w-4 h-4 text-green-600" />
          </div>
        )}
      </div>

      <div className="p-2">
        <h3 className={`font-bold ${classes.textPrimary} text-sm mb-1 ${!deal.isOutOfTime && 'group-hover:text-green-600 dark:group-hover:text-green-400'} transition-colors truncate`}>
          {deal.name}
        </h3>
        {deal.description && (
          <p className={`${classes.textSecondary} text-xs truncate`}>
            {deal.description}
          </p>
        )}
      </div>
    </div>
  )

  return (
    <>
    <div className={`flex-1 flex flex-col overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className={`${classes.card} ${classes.shadow} shadow-sm ${classes.border} border-b p-4`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex-shrink-0">
            <h1 className={`text-xl font-bold ${classes.textPrimary}`}>
              Products Menu
            </h1>
            <p className={`${classes.textSecondary} text-sm`}>
              {isSearchActive
                ? `${(searchResults?.products.length || 0) + (searchResults?.deals.length || 0)} results for "${searchQuery.trim()}"`
                : `${visibleProductCount} items available`}
              {!networkStatus?.isOnline && (
                <span className={`ml-2 ${isDark ? 'text-orange-400' : 'text-orange-600'} font-medium`}>(Offline Mode)</span>
              )}
            </p>
          </div>
          {headerCenter && (
            <div className="flex-1 flex justify-center px-2">
              {headerCenter}
            </div>
          )}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Arrange (drag-to-reorder) toggle — writes the shared sort_order */}
            {onReorderProducts && (
              <button
                onClick={() => !isSearchActive && setArrangeMode(v => !v)}
                disabled={isSearchActive}
                title={
                  isSearchActive
                    ? 'Clear the search to arrange products'
                    : 'Drag products to set the order they appear in'
                }
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                  arrangeMode
                    ? 'bg-green-600 text-white'
                    : isSearchActive
                    ? `${classes.textSecondary} opacity-40 cursor-not-allowed`
                    : isDark
                    ? 'hover:bg-green-900/40 text-green-400'
                    : 'hover:bg-green-50 text-green-600'
                }`}
              >
                {arrangeMode ? <Check className="w-4 h-4" /> : <GripVertical className="w-4 h-4" />}
                <span className="hidden sm:inline">{arrangeMode ? 'Done' : 'Arrange'}</span>
              </button>
            )}
            {/* On classic pages (no tabs) keep the analytics icon on the right */}
            {!headerCenter && (
              <button
                onClick={() => setShowAnalytics(true)}
                title="My Shift Analytics"
                className={`p-2 rounded-xl transition-all ${isDark ? 'hover:bg-indigo-900/40 text-indigo-400' : 'hover:bg-indigo-50 text-indigo-500'}`}
              >
                <BarChart2 className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              </button>
            )}
            <div className="text-right">
              <div className={`text-xs ${classes.textSecondary}`}>
                {new Date().toLocaleDateString()}
              </div>
              {/* Time hidden on the new-order screen to free up horizontal space */}
              {!headerCenter && (
                <div className={`text-sm font-semibold ${classes.textPrimary}`}>
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search Bar + Add Product */}
        <div className="flex items-center gap-2">
        <div className={`relative flex items-center flex-1 min-w-0 rounded-xl border ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-200'} focus-within:ring-2 focus-within:ring-green-500 focus-within:border-green-500 transition-all`}>
          <Search className={`absolute left-3 w-4 h-4 ${classes.textSecondary} flex-shrink-0`} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search products..."
            className={`w-full pl-9 pr-8 py-2.5 text-sm bg-transparent outline-none ${classes.textPrimary} placeholder:${classes.textSecondary}`}
          />
          {isSearchActive && (
            <button
              onClick={clearSearch}
              className={`absolute right-2 w-5 h-5 flex items-center justify-center rounded-full ${isDark ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-300 hover:bg-gray-400'} transition-colors`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {onAddProduct && (
          <button
            onClick={onAddProduct}
            title="Add a product"
            className="flex-shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Product</span>
          </button>
        )}
        </div>
      </div>

      <div ref={gridContainerRef} className="flex-1 overflow-y-scroll p-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>

        {/* Search Results View */}
        {isSearchActive ? (
          <>
            {searchResults.products.length === 0 && searchResults.deals.length === 0 ? (
              <div className="text-center py-20">
                <div className={`w-24 h-24 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded-full flex items-center justify-center mx-auto mb-6`}>
                  <Search className={`w-12 h-12 ${classes.textSecondary}`} />
                </div>
                <h3 className={`text-2xl font-bold ${classes.textSecondary} mb-3`}>
                  No results found
                </h3>
                <p className={`${classes.textSecondary} text-lg`}>
                  No products match &quot;{searchQuery.trim()}&quot;
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                {searchResults.products.map(renderProductCard)}
                {searchResults.deals.map(renderDealCard)}
              </div>
            )}
          </>
        ) : arrangeMode ? (
          <>
            {/* Arrange mode — drag cards within a category to set POS order */}
            <div className={`mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm ${isDark ? 'bg-green-900/20 border-green-800 text-green-300' : 'bg-green-50 border-green-200 text-green-700'}`}>
              <GripVertical className="w-4 h-4 flex-shrink-0" />
              <span>
                Drag products to reorder them within each category. This sets the
                order they show here and in the admin panel. Saved automatically.
              </span>
            </div>
            {categories.map((category) => {
              const categoryProducts = productsByCategory[category.id] || []
              if (categoryProducts.length === 0) return null

              return (
                <div
                  key={category.id}
                  ref={el => productRefs.current[category.id] = el}
                  className="mb-6"
                >
                  <div className={`sticky top-0 ${classes.card} py-2 z-10 rounded-lg mb-3 ${classes.shadow} shadow-sm`}>
                    <h2 className={`text-lg font-bold ${classes.textPrimary} px-3`}>
                      {category.name}
                    </h2>
                    <div className={`text-xs ${classes.textSecondary} px-3`}>
                      {categoryProducts.length} items
                    </div>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => handleCategoryDragEnd(e, category.id, categoryProducts)}
                  >
                    <SortableContext
                      items={categoryProducts.map(p => p.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                        {categoryProducts.map((product, index) => (
                          <SortableProductCard
                            key={product.id}
                            product={product}
                            index={index}
                            classes={classes}
                            isDark={isDark}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              )
            })}
            {allProducts.length === 0 && (
              <div className="text-center py-20">
                <div className={`w-24 h-24 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded-full flex items-center justify-center mx-auto mb-6`}>
                  <Coffee className={`w-12 h-12 ${classes.textSecondary}`} />
                </div>
                <h3 className={`text-2xl font-bold ${classes.textSecondary} mb-3`}>
                  No products to arrange
                </h3>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Favorites — virtual section pinned first, shared with the admin panel */}
            {hasFavorites && (
              <div ref={favoritesRef} className="mb-6">
                <div className={`sticky top-0 ${classes.card} py-2 z-10 rounded-lg mb-3 ${classes.shadow} shadow-sm`}>
                  <h2 className={`text-lg font-bold ${classes.textPrimary} px-3 flex items-center gap-2`}>
                    <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                    Favorites
                  </h2>
                  <div className={`text-xs ${classes.textSecondary} px-3`}>
                    {favoriteProducts.length + favoriteDeals.length} items
                  </div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                  {favoriteProducts.map(renderProductCard)}
                  {favoriteDeals.map(renderDealCard)}
                </div>
              </div>
            )}

            {/* Categories and Products */}
            {categories.map((category) => {
              const categoryProducts = productsByCategory[category.id] || []
              if (categoryProducts.length === 0) return null

              return (
                <div
                  key={category.id}
                  ref={el => productRefs.current[category.id] = el}
                  className="mb-6"
                >
                  <div className={`sticky top-0 ${classes.card} py-2 z-10 rounded-lg mb-3 ${classes.shadow} shadow-sm`}>
                    <h2 className={`text-lg font-bold ${classes.textPrimary} px-3`}>
                      {category.name}
                    </h2>
                    <div className={`text-xs ${classes.textSecondary} px-3`}>
                      {categoryProducts.length} items
                    </div>
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                    {categoryProducts.map(renderProductCard)}
                  </div>
                </div>
              )
            })}

            {/* Deals Section - Always show at the end after all categories */}
            {deals && deals.length > 0 && (
              <div ref={dealRef} className="mb-6">
                <div className={`sticky top-0 ${classes.card} py-2 z-10 rounded-lg mb-3 ${classes.shadow} shadow-sm`}>
                  <h2 className={`text-lg font-bold ${classes.textPrimary} px-3`}>
                    Special Deals
                  </h2>
                  <div className={`text-xs ${classes.textSecondary} px-3`}>
                    {deals.length} deals available
                  </div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                  {deals.map(renderDealCard)}
                </div>
              </div>
            )}

            {allProducts.length === 0 && (!deals || deals.length === 0) && (
              <div className="text-center py-20">
                <div className={`w-24 h-24 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded-full flex items-center justify-center mx-auto mb-6`}>
                  <Coffee className={`w-12 h-12 ${classes.textSecondary}`} />
                </div>
                <h3 className={`text-2xl font-bold ${classes.textSecondary} mb-3`}>
                  No products found
                </h3>
                <p className={`${classes.textSecondary} text-lg`}>
                  Add some delicious items to get started
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>

    {showAnalytics && (
      <CashierAnalytics
        isOpen={showAnalytics}
        onClose={() => setShowAnalytics(false)}
        isDark={isDark}
      />
    )}
    </>
  )
})

ProductGrid.displayName = 'ProductGrid'

export default ProductGrid
