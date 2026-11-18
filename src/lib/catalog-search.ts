/** Imported/older documents can omit metadata; never crash the whole catalog while searching. */
export function matchesProductSearch(product:{name?:unknown;category?:unknown;description?:unknown;sku?:unknown},term:string,includeDescription=false){
 if(typeof product.name!=='string')return false;
 const fields=includeDescription?[product.name,product.description,product.sku]:[product.name,product.category,product.sku];
 const search=term.toLowerCase();
 return fields.some(value=>typeof value==='string'&&value.toLowerCase().includes(search));
}

/** Shared Explore filters apply consistently to the legacy and seller catalogues. */
export type CatalogFilters = {
 category: string;
 price: 'all' | 'under-500' | '500-1000' | '1000-2500' | 'over-2500';
 availability: 'all' | 'orderable' | 'made-to-order' | 'unavailable';
 sort: 'default' | 'price-asc' | 'price-desc' | 'name-asc';
};
export const defaultCatalogFilters: CatalogFilters = {
 category: 'All', price: 'all', availability: 'all', sort: 'default',
};

type CatalogItem = {
 name?: string;
 category?: string;
 price: number;
 showPrice: boolean;
 availability?: 'available' | 'made-to-order' | 'unavailable';
 stockQuantity?: number;
 minimumOrderQuantity?: number;
 weightOptions?: Array<{ price?: number; stockQuantity?: number }>;
};

function categoryWords(value: string): string[] {
 return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
  .filter(Boolean).map(word => word.endsWith('s') && word.length > 3 ? word.slice(0,-1) : word);
}
export function matchesCatalogCategory(productCategory: string, selected: string): boolean {
 if (selected === 'All' || !selected) return true;
 const target = categoryWords(selected);
 const product = categoryWords(productCategory || '');
 return target.length > 0 && target.every(word => product.includes(word));
}

/** Sort/filter against the lowest displayed seller-size price (not an arbitrary variant). */
export function catalogDisplayPrice(item: CatalogItem): number | null {
 if (!item.showPrice) return null;
 const choices = item.weightOptions?.length
  ? item.weightOptions.map(option => option.price ?? item.price)
  : [item.price];
 const valid = choices.filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
 return valid.length ? Math.min(...valid) : null;
}
export function catalogIsOrderable(item: CatalogItem): boolean {
 if (!item.showPrice) return false;
 if (!item.availability) return true; // Older products do not track stock.
 if (item.availability === 'unavailable') return false;
 if (item.availability === 'made-to-order') return true;
 const quantity = Math.max(1, item.minimumOrderQuantity ?? 1);
 return item.weightOptions?.length
  ? item.weightOptions.some(option => (option.stockQuantity ?? item.stockQuantity ?? 0) >= quantity)
  : (item.stockQuantity ?? 0) >= quantity;
}
export function applyCatalogFilters<T extends CatalogItem>(items: T[], filters: CatalogFilters): T[] {
 const filtered = items.filter(item => {
  if (!matchesCatalogCategory(item.category ?? '', filters.category)) return false;
  const amount = catalogDisplayPrice(item);
  if (filters.price !== 'all') {
   if (amount === null) return false;
   if (filters.price === 'under-500' && amount >= 500) return false;
   if (filters.price === '500-1000' && (amount < 500 || amount >= 1000)) return false;
   if (filters.price === '1000-2500' && (amount < 1000 || amount >= 2500)) return false;
   if (filters.price === 'over-2500' && amount < 2500) return false;
  }
  if (filters.availability === 'orderable' && !catalogIsOrderable(item)) return false;
  if (filters.availability === 'made-to-order' && item.availability !== 'made-to-order') return false;
  if (filters.availability === 'unavailable' && catalogIsOrderable(item)) return false;
  return true;
 });
 if (filters.sort === 'default') return filtered;
 // Preserve the original relative order of identically priced products.
 return filtered.map((item, index) => ({ item, index })).sort((a,b) => {
  if (filters.sort === 'name-asc') return (a.item.name ?? '').localeCompare(b.item.name ?? '') || a.index-b.index;
  const priceA=catalogDisplayPrice(a.item),priceB=catalogDisplayPrice(b.item);
  if (priceA === null || priceB === null) return priceA === priceB ? a.index-b.index : priceA === null ? 1 : -1;
  return (filters.sort === 'price-asc' ? priceA-priceB : priceB-priceA) || a.index-b.index;
 }).map(({item}) => item);
}
