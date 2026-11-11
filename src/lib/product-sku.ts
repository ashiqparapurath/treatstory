/** Friendly public product reference; uniqueness is enforced by server reservations. */
export const SKU_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PRODUCT_SKU_PATTERN = /^TS-[A-HJ-NP-Z2-9]{8}$/;
export function normalizeProductSku(value: string): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const compact = value.trim().toUpperCase().replace(/[\s-]/g, "");
  const code = compact.startsWith("TS") ? "TS-" + compact.slice(2) : "";
  return PRODUCT_SKU_PATTERN.test(code) ? code : null;
}
