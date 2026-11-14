/** Bounded Unicode word-prefix index. Search is word-prefix based, not substring scanning. */
export function searchWords(value: string) {
  return (
    value
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || []
  );
}
export function productSearchPrefixes(product: {
  name?: unknown;
  category?: unknown;
  sku?: unknown;
}) {
  const words = searchWords(
    [product.name, product.category, product.sku]
      .filter((v) => typeof v === 'string')
      .join(' '),
  ).slice(0, 32);
  const result = new Set<string>();
  for (const word of words)
    for (let n = 1; n <= Math.min(word.length, 40); n++)
      result.add(word.slice(0, n));
  return [...result].slice(0, 800);
}
export function searchIndexTerm(query: string) {
  return searchWords(query)[0]?.slice(0, 40) || '';
}
