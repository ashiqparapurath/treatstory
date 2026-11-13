import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'New Arrivals — Fresh Bakes & Handmade Finds',
  description: 'Explore recently added home-baked treats, handcrafted gifts and original creations from makers in Kerala on TreatStory.',
  alternates: { canonical: '/new-arrivals' },
  openGraph: { title: 'New Arrivals | TreatStory', description: 'Fresh finds from independent creators across Kerala.', url: '/new-arrivals' },
};
export default function NewArrivalsLayout({children}:{children:React.ReactNode}) { return children; }
