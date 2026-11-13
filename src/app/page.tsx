import type { Metadata } from 'next';
import HomeClient from '@/components/home-client';

export const metadata: Metadata = {
  title: { absolute: 'TreatStory | Home Bakes, Handmade Gifts & Crafts in Kerala' },
  description: 'Discover homemade cakes, handcrafted gifts, original art and creative finds from independent home bakers and makers across Kerala at TreatStory.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'TreatStory | Home Bakes & Handmade Gifts in Kerala',
    description: 'Explore home-baked treats, handmade crafts and thoughtful gifts by independent Kerala creators.',
    url: '/',
  },
};
export default function HomePage(){ return <HomeClient/>; }
