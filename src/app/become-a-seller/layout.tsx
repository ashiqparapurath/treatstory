import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Become a Seller — Home Bakers & Handmade Creators',
  description: 'Are you a home baker, artist or handmade creator in India? Apply to join TreatStory and showcase your products. Delivery areas are set by each seller.',
  alternates: { canonical: '/become-a-seller' },
  openGraph: { title: 'Become a Seller | TreatStory', description: 'Bring your home bakery or handmade creations to TreatStory, wherever you are in India.', url: '/become-a-seller' },
};
export default function BecomeSellerLayout({children}:{children:React.ReactNode}) { return children; }
