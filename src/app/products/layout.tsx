import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Shop Home Bakes, Handmade Gifts & Crafts Across India',
  description: 'Browse handmade gifts, home-baked treats, art and crafts from independent makers across India on TreatStory. Delivery varies by seller.',
  alternates: { canonical: '/products' },
  openGraph: { title: 'Shop Home Bakes & Handmade Finds | TreatStory', description: 'Discover home bakers and handmade creators across India.', url: '/products' },
};
export default function ProductsLayout({children}:{children:React.ReactNode}) { return children; }
