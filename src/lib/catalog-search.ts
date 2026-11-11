/** Imported/older documents can omit metadata; never crash the whole catalog while searching. */
export function matchesProductSearch(product:{name?:unknown;category?:unknown;description?:unknown;sku?:unknown},term:string,includeDescription=false){
 if(typeof product.name!=='string')return false;
 const fields=includeDescription?[product.name,product.description,product.sku]:[product.name,product.category,product.sku];
 const search=term.toLowerCase();
 return fields.some(value=>typeof value==='string'&&value.toLowerCase().includes(search));
}
