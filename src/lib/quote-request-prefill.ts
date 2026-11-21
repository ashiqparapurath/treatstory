import type { MarketplaceProduct } from '@/lib/marketplace-types';

/** The buyer may edit the generated request before sending it. Never infer a market price.
 * Only recognize a size that belongs to the selected published product.
 */
export function quoteRequestSize(
  product: Pick<MarketplaceProduct, 'weightOptions' | 'weightValue' | 'weightUnit'>,
  requestedSize: string,
): string {
  const optionsMatch = product.weightOptions?.some(option => option.value + ' ' + option.unit === requestedSize);
  const legacyMatch = product.weightValue && product.weightUnit
    && product.weightValue + ' ' + product.weightUnit === requestedSize;
  return optionsMatch || legacyMatch ? requestedSize : '';
}

export function priceRequestDescription(
  product: Pick<MarketplaceProduct, 'name' | 'category' | 'description' | 'sku' | 'weightOptions' | 'weightValue' | 'weightUnit'>,
  requestedSize = '',
): string {
  const size = quoteRequestSize(product, requestedSize);
  return [
    'Product: ' + product.name.trim().slice(0, 160),
    'Category: ' + product.category.trim().slice(0, 100),
    ...(size ? ['Selected size: ' + size] : []),
    ...(product.sku ? ['Product SKU: ' + product.sku.slice(0, 80)] : []),
    ...(product.description?.trim()
      ? ['Product details: ' + product.description.trim().slice(0, 1000)] : []),
    'Please confirm the current market price and availability for this product.',
  ].join('\n').slice(0, 1950);
}
