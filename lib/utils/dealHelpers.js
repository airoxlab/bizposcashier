// Shared helpers for deal handling across the order screens (new-order, walkin,
// delivery, takeaway). Single source of truth so every flow behaves identically.

// A deal product needs no cashier input when it has no variants, or when its
// variant is locked/pre-assigned (admin disabled "Allow flavor/variant change",
// so cacheManager set `variantName`). A deal is fully auto when every product is
// like that — there is nothing to choose, so the selection screen can be skipped.
export function isDealFullyAuto(dealProducts) {
  if (!dealProducts || dealProducts.length === 0) return false
  return dealProducts.every(p => {
    const hasVariants = p.variants?.length > 0
    const hasPreAssignedVariant = p.variantName
    return !hasVariants || hasPreAssignedVariant
  })
}

// Build the cart item for a fully-auto deal: quantity 1, no variant upgrade
// (locked variants are included at the deal price). Mirrors the locked path of
// DealFlavorSelectionScreen.addToCartWithSelection exactly so cart, receipts and
// order-save treat a direct-added deal identically to a screen-added one.
export function buildAutoDealCartItem(deal, dealProducts) {
  const baseDealPrice = parseFloat(deal.price)
  const selectedDealProducts = dealProducts.map(dp => ({
    name: dp.productName || dp.name,
    quantity: dp.quantity || 1,
    variant: dp.variantName || null,
    variantPrice: dp.variantPrice ? parseFloat(dp.variantPrice) : 0,
    priceAdjustment: 0
  }))
  return {
    id: `deal-${deal.id}-${Date.now()}`,
    isDeal: true,
    dealId: deal.id,
    dealName: deal.name,
    dealProducts: selectedDealProducts,
    baseDealPrice,
    priceAdjustment: 0,
    finalPrice: baseDealPrice,
    quantity: 1,
    totalPrice: baseDealPrice,
    image: deal.image_url
  }
}
