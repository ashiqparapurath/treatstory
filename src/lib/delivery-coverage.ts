/** India-wide seller coverage is opt-in. Unknown/legacy coverage still requires seller confirmation. */
export type DeliveryCoverage = 'confirm' | 'selected-pincodes' | 'india-wide';

export type SellerDeliveryCoverage = {
  deliveryCoverage?: DeliveryCoverage;
  deliveryPincodes?: string[];
};

/**
 * Check whether a delivery request may be submitted, not a guarantee that the
 * order will ship. COD, shipping charges and feasibility require seller acceptance.
 */
export function acceptsDeliveryRequest(seller: SellerDeliveryCoverage, pincode: string): boolean {
  if (!/^[1-9][0-9]{5}$/.test(pincode)) return false;
  if (seller.deliveryCoverage === 'india-wide') return true;
  if (seller.deliveryCoverage === 'selected-pincodes') {
    return !!seller.deliveryPincodes?.includes(pincode);
  }
  // Preserve earlier sellers' selected PIN coverage; otherwise let sellers review
  // order requests as before. Never describe the legacy blank list as nationwide.
  return seller.deliveryPincodes?.length ? seller.deliveryPincodes.includes(pincode) : true;
}

export function sellerCoverageLabel(seller: SellerDeliveryCoverage): string {
  if (seller.deliveryCoverage === 'india-wide') return 'Accepts delivery requests across India · seller confirmation required';
  if (seller.deliveryPincodes?.length) return 'Delivery to selected PIN codes: ' + seller.deliveryPincodes.join(', ');
  return 'Ask the seller to confirm your delivery PIN code';
}
