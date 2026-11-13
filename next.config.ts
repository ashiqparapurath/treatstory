
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // Social crawlers must receive complete metadata in HTML without executing scripts.
  htmlLimitedBots: /bot|crawler|spider|preview|facebookexternalhit|facebookcatalog|WhatsApp|Slurp|tumblr|vkShare|ia_archiver|Yeti|googleweblight|Chrome-Lighthouse|yandex|sogou|[\w-]+-Google|Google-[\w-]+/i,
  poweredByHeader:false,
  productionBrowserSourceMaps:false,
  async headers(){return [{source:'/:path*',headers:[
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'X-Frame-Options',value:'DENY'},
    {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
    {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(self)'},
    {key:'Content-Security-Policy',value:"frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'"},
    // Avoid Google indexing temporary Vercel preview deployments as duplicate sites.
    ...(process.env.VERCEL_ENV === 'preview' ? [{key:'X-Robots-Tag',value:'noindex, nofollow'}] : []),
  ]}];},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https'
        ,
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: false,
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
