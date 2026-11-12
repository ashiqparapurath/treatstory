import type {Metadata, Viewport} from 'next';
import{siteSocialMetadata}from'@/lib/social-metadata';
import { pwaStartupImages } from '@/lib/pwa-startup-images';
import branding from '@/lib/pwa-branding.json';
import { pwaIcons } from '@/lib/pwa-icons';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppInstallNotice } from '@/components/app-install-notice';
import { Toaster } from "@/components/ui/toaster"
import { cn } from '@/lib/utils';
import { CartProvider } from '@/context/cart-context';
import { MoreNavigationTrail } from '@/components/more-navigation-trail';
import { FirebaseClientProvider } from '@/firebase/client-provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  ...siteSocialMetadata(),
  title: {
    default: 'TreatStory — Little finds, lovely stories',
    template: '%s | TreatStory',
  },
  description: 'Discover home bakes, handmade crafts, art and thoughtful finds from independent creators at TreatStory.',
  applicationName: 'TreatStory',
  appleWebApp: { capable: true, title: 'TreatStory', statusBarStyle: 'default', startupImage: pwaStartupImages.map(({url,media})=>({url,media})) },
  icons: {
    icon: [{ url: '/favicon.ico', sizes: 'any', type: 'image/x-icon' }],
    apple: [{ url: pwaIcons.apple, sizes: '180x180', type: 'image/png' }],
  },
};

// Keep browser-managed system-bar insets rather than requesting edge-to-edge at page load.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'auto', themeColor: branding.background };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.json" crossOrigin="use-credentials" />
      </head>
      <body className={cn("min-h-screen bg-background font-sans antialiased", inter.variable)}>
        <FirebaseClientProvider>
          <CartProvider>
            <MoreNavigationTrail />
            {children}
          </CartProvider>
        </FirebaseClientProvider>
        <AppInstallNotice />
        <Toaster />
      </body>
    </html>
  );
}
