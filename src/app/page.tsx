import type { Metadata } from 'next';
import HomeClient from '@/components/home-client';

export const metadata: Metadata = {
  title: { absolute: 'TreatStory | Home Bakes, Handmade Gifts & Crafts Across India' },
  description: 'Discover homemade cakes, handcrafted gifts, original art and creative finds from independent home bakers and makers across India at TreatStory.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'TreatStory | Home Bakes & Handmade Gifts Across India',
    description: 'Explore home-baked treats, handmade crafts and thoughtful gifts by independent creators across India.',
    url: '/',
  },
};
export default function HomePage(){ return <HomeClient/>; }
