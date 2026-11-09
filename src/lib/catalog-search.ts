/** Imported/older documents can omit metadata; never crash the whole catalog while searching. */
export function matchesProductSearch(product:{name?:unknown;category?:unknown;description?:unknown},term:string,includeDescription=false){
 if(typeof product.name!=='string')return false;
 const fields=includeDescription?[product.name,product.description]:[product.name,product.category];
 const search=term.toLowerCase();
 return fields.some(value=>typeof value==='string'&&value.toLowerCase().includes(search));
}
