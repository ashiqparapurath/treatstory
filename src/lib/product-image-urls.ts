/** Preserve Cloudinary transformation commas within image links. */
export function parseProductImageUrls(value: string): string[] {
  return value.split(/\r?\n|,\s*(?=https?:\/\/)/i)
    .map(url => url.trim())
    .filter(Boolean);
}
