import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Our Story — Meet TreatStory',
  description: 'Meet TreatStory, the Kerala-born marketplace connecting home bakers, artists and handmade creators with people who appreciate their work.',
  alternates: { canonical: '/about' },
  openGraph: { title: 'Our Story | TreatStory', description: 'A marketplace built for Kerala home bakers and handmade makers.', url: '/about' },
};
export default function AboutLayout({children}:{children:React.ReactNode}) { return children; }
