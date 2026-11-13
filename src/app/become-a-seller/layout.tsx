import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Become a Seller — Home Bakers & Handmade Creators',
  description: 'Are you a home baker, artist or handmade creator in Kerala? Apply to join the TreatStory marketplace and showcase your products.',
  alternates: { canonical: '/become-a-seller' },
  openGraph: { title: 'Become a Seller | TreatStory', description: 'Bring your Kerala home bakery or handmade creations to TreatStory.', url: '/become-a-seller' },
};
export default function BecomeSellerLayout({children}:{children:React.ReactNode}) { return children; }
