import sharp from "sharp";
import { writeFile } from "node:fs/promises";
const overlay = Buffer.from(
  `<svg width="1200" height="630"><rect x="54" y="98" width="550" height="430" rx="34" fill="#faf8f3" fill-opacity=".96"/><text x="94" y="205" font-family="Georgia,serif" font-size="66" fill="#2c2823">TreatStory</text><text x="94" y="300" font-family="Georgia,serif" font-size="49" fill="#2c2823">Little finds.</text><text x="94" y="365" font-family="Georgia,serif" font-style="italic" font-size="49" fill="#a68a64">Lovely stories.</text><text x="94" y="450" font-family="sans-serif" font-size="24" fill="#6f6659">Homemade treats &amp; handmade gifts</text></svg>`,
);
const bytes = await sharp(
  new URL("../public/img/landing-hero.png", import.meta.url).pathname,
)
  .resize(1200, 630, { fit: "cover", position: "centre" })
  .composite([{ input: overlay }])
  .jpeg({ quality: 85, mozjpeg: true })
  .toBuffer();
await writeFile(
  new URL("../public/img/share-preview.jpg", import.meta.url),
  bytes,
);
console.log("Generated share preview:", bytes.length, "bytes");
