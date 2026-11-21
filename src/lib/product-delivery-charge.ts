/** Delivery is charged once per seller per grouped checkout.
 * A product may override the store-wide fee, including with ₹0 for free delivery.
 * When a buyer combines products from one seller, use the highest applicable
 * fee, never stack fees on every line or quantity.
 */
export function applicableDeliveryCharge(
  product: { deliveryCharge?: number | null },
  storeDeliveryFee = 0,
): number {
  return product.deliveryCharge ?? storeDeliveryFee;
}

export function groupedDeliveryCharge(
  products: Array<{ deliveryCharge?: number | null }>,
  storeDeliveryFee = 0,
): number {
  return products.reduce(
    (highest, product) => Math.max(highest, applicableDeliveryCharge(product, storeDeliveryFee)),
    0,
  );
}
