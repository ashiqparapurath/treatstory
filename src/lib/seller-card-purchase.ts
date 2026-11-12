import type { MarketplaceProduct } from '@/lib/marketplace-types';
import type { Product } from '@/lib/products';

export type SellerCardWeightOption = NonNullable<MarketplaceProduct['weightOptions']>[number];

/** Preserve the legacy single-weight shape without inventing unavailable variants. */
export function sellerCardWeightChoices(product: MarketplaceProduct): SellerCardWeightOption[] {
  if (product.weightOptions?.length) return product.weightOptions;
  if (product.weightValue && product.weightUnit) return [{ value: product.weightValue, unit: product.weightUnit }];
  return [];
}

export function canBuySellerSize(product: MarketplaceProduct, option?: SellerCardWeightOption): boolean {
  const minimum = Math.max(1, product.minimumOrderQuantity ?? 1);
  const stock = option?.stockQuantity ?? product.stockQuantity ?? 0;
  const price = option?.price ?? product.price;
  return product.showPrice === true && product.availability !== 'unavailable' &&
    Number.isFinite(price) && price >= 0 && (product.availability === 'made-to-order' || stock >= minimum);
}

/** Use the same variant identity and exact price as the full product detail page. */
export function createSellerCardCartItem(product: MarketplaceProduct, option?: SellerCardWeightOption): Product {
  return {
    id: 'seller:' + product.id,
    sellerId: product.sellerId,
    name: product.name,
    description: product.description,
    category: product.category,
    categoryId: product.category,
    price: option?.price ?? product.price,
    imageUrls: product.imageUrls,
    showPrice: product.showPrice,
    minimumOrderQuantity: product.minimumOrderQuantity,
    selectedWeight: option ? { value: option.value, unit: option.unit } : undefined,
    customizationNote: option ? `Selected weight / size: ${option.value} ${option.unit}` : undefined,
  };
}
