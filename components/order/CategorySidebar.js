'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Coffee, Utensils, Cookie, Gift, ArrowLeft, Table2, ClipboardList, LayoutList, Layers, ChevronDown, ChevronRight } from 'lucide-react'

export default function CategorySidebar({
  categories = [],
  menus = [],
  deals = [],
  onCategoryClick,
  onDealClick,
  getProductCount,
  onBackClick,
  classes,
  isDark,
  orderType = 'walkin',
  isReopenedOrder = false,
  onTableClick,
  selectedTable,
  onOrdersClick,
  showOrdersView = false
}) {
  const [isGrouped, setIsGrouped] = useState(menus.length > 0)
  const [collapsedMenus, setCollapsedMenus] = useState({})

  const toggleMenuCollapse = (menuId) => {
    setCollapsedMenus(prev => ({ ...prev, [menuId]: !prev[menuId] }))
  }

  const getCategoryIcon = (categoryName) => {
    const name = categoryName?.toLowerCase() || ''
    if (name.includes('coffee') || name.includes('drink')) return Coffee
    if (name.includes('food') || name.includes('meal')) return Utensils
    return Cookie
  }

  const getOrderTypeTitle = () => {
    switch(orderType) {
      case 'walkin': return 'Walk-In Order'
      case 'takeaway': return 'Takeaway Order'
      case 'delivery': return 'Delivery Order'
      default: return 'Order'
    }
  }

  const renderCategoryButton = (category) => {
    const IconComponent = getCategoryIcon(category.name)
    const productCount = getProductCount(category.id)
    return (
      <motion.button
        key={category.id}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onCategoryClick(category.id)}
        className={`w-full text-left p-3 rounded-lg transition-all duration-300 group hover:${isDark ? 'bg-green-900/20' : 'bg-green-100'} ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}
      >
        <div className="flex items-center">
          <div className={`w-10 h-10 rounded-lg overflow-hidden mr-3 ${isDark ? 'bg-green-900/30' : 'bg-green-100'} flex items-center justify-center`}>
            {category.image_url ? (
              <img
                src={category.image_url}
                alt={category.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <IconComponent className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`font-semibold ${classes.textPrimary} truncate text-sm`}>
              {category.name}
            </div>
            <div className={`text-xs ${classes.textSecondary}`}>
              {productCount} items
            </div>
          </div>
        </div>
      </motion.button>
    )
  }

  // Build grouped list: each menu + its categories, then uncategorized at end
  const renderGroupedCategories = () => {
    const menuMap = {}
    menus.forEach(m => { menuMap[m.id] = m })

    const grouped = menus.map(menu => ({
      menu,
      cats: categories.filter(c => c.menu_id === menu.id)
    })).filter(g => g.cats.length > 0)

    const unassigned = categories.filter(c => !c.menu_id || !menuMap[c.menu_id])

    const renderMenuGroup = (id, label, cats, labelClass) => {
      const collapsed = collapsedMenus[id]
      return (
        <div key={id} className="mb-3">
          <button
            onClick={() => toggleMenuCollapse(id)}
            className={`w-full flex items-center justify-between px-1 mb-1.5 group`}
          >
            <span className={`text-xs font-bold uppercase tracking-wider ${labelClass}`}>{label}</span>
            {collapsed
              ? <ChevronRight className={`w-3.5 h-3.5 ${labelClass}`} />
              : <ChevronDown className={`w-3.5 h-3.5 ${labelClass}`} />
            }
          </button>
          {!collapsed && <div className="space-y-1">{cats.map(renderCategoryButton)}</div>}
        </div>
      )
    }

    return (
      <>
        {grouped.map(({ menu, cats }) =>
          renderMenuGroup(menu.id, menu.name, cats, isDark ? 'text-green-400' : 'text-green-700')
        )}
        {unassigned.length > 0 &&
          renderMenuGroup('__other__', grouped.length > 0 ? 'Other' : 'Categories', unassigned, classes.textSecondary)
        }
      </>
    )
  }

  return (
    <div className={`w-64 ${classes.card} ${classes.shadow} shadow-xl ${classes.border} border-r flex flex-col`}>
      <div className={`p-4 ${classes.border} border-b ${classes.card}`}>
        <motion.button
          whileHover={{ x: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={onBackClick}
          className={`flex items-center ${classes.textSecondary} hover:${classes.textPrimary} transition-colors mb-3 group`}
        >
          <div className={`w-8 h-8 rounded-full ${classes.button} group-hover:${classes.shadow} group-hover:shadow-sm flex items-center justify-center mr-3 transition-colors`}>
            <ArrowLeft className="w-4 h-4" />
          </div>
          <span className="font-medium text-sm">Back to Dashboard</span>
        </motion.button>

        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className={`text-xl font-bold ${classes.textPrimary}`}>
              {isReopenedOrder ? 'Reopened Order' : 'New Order'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Orders Icon - For walkin, takeaway, and delivery orders */}
            {(orderType === 'walkin' || orderType === 'takeaway' || orderType === 'delivery') && onOrdersClick && (
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={onOrdersClick}
                className={`p-2.5 rounded-lg transition-all relative ${
                  showOrdersView
                    ? (isDark ? 'bg-blue-600/30 border border-blue-500' : 'bg-blue-100 border border-blue-400')
                    : (isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200')
                }`}
                title="View pending orders"
              >
                <ClipboardList className={`w-5 h-5 ${showOrdersView ? (isDark ? 'text-blue-400' : 'text-blue-600') : (isDark ? 'text-gray-300' : 'text-gray-600')}`} />
              </motion.button>
            )}

            {/* Table Selection Icon - Only for walkin orders */}
            {orderType === 'walkin' && onTableClick && (
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={onTableClick}
                className={`p-2.5 rounded-lg transition-all relative ${
                  selectedTable
                    ? (isDark ? 'bg-green-600/30 border border-green-500' : 'bg-green-100 border border-green-400')
                    : (isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200')
                }`}
                title={selectedTable ? `Table: ${selectedTable.table_name || selectedTable.table_number}` : 'Select Table'}
              >
                <Table2 className={`w-5 h-5 ${selectedTable ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-gray-300' : 'text-gray-600')}`} />
                {selectedTable && (
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800 shadow-sm"></div>
                )}
              </motion.button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-scroll p-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>

        {/* Categories Section */}
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-xs font-semibold ${classes.textSecondary} uppercase tracking-wider`}>
            Categories
          </h3>
          {menus.length > 0 && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setIsGrouped(g => !g)}
              title={isGrouped ? 'Ungroup categories' : 'Group by menu'}
              className={`p-1 rounded transition-colors ${
                isGrouped
                  ? (isDark ? 'text-green-400 bg-green-900/30' : 'text-green-600 bg-green-100')
                  : (isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600')
              }`}
            >
              {isGrouped ? <Layers className="w-3.5 h-3.5" /> : <LayoutList className="w-3.5 h-3.5" />}
            </motion.button>
          )}
        </div>

        {isGrouped && menus.length > 0
          ? renderGroupedCategories()
          : <div className="space-y-1">{categories.map(renderCategoryButton)}</div>
        }

        {/* Deals Quick Access Button */}
        {deals && deals.length > 0 && (
          <>
            <h3 className={`text-xs font-semibold ${classes.textSecondary} uppercase tracking-wider mb-3 mt-4`}>
              Special Deals
            </h3>
            <div className="space-y-1">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onDealClick({ scrollToDeals: true })}
                className={`w-full text-left p-3 rounded-lg transition-all duration-300 group hover:${isDark ? 'bg-green-900/20' : 'bg-green-100'} ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}
              >
                <div className="flex items-center">
                  <div className={`w-10 h-10 rounded-lg overflow-hidden mr-3 ${isDark ? 'bg-green-900/30' : 'bg-green-100'} flex items-center justify-center`}>
                    <Gift className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold ${classes.textPrimary} truncate text-sm`}>
                      View All Deals
                    </div>
                    <div className={`text-xs ${classes.textSecondary}`}>
                      {deals.length} deals
                    </div>
                  </div>
                </div>
              </motion.button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
