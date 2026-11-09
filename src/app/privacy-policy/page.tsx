
import { Header } from '@/components/header';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1">
        <div className="section-shell py-12 md:py-20 lg:py-24">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-8">
              Privacy Policy
            </h1>
            <div className="space-y-6 text-muted-foreground">
              <p>At TreatStory, accessible from treatstory.in, one of our main priorities is the privacy of our visitors. This Privacy Policy document contains types of information that is collected and recorded by TreatStory and how we use it.</p>
              <h2 className="mt-6 text-xl font-semibold">Optional delivery location</h2>
              <p>When you choose Use my location and grant browser permission, we send your coordinates through our server to an OpenStreetMap Nominatim geocoding service to suggest your locality, district, state and PIN. We do not track your location continuously or store coordinates in your address book. Only address details you confirm and save are kept for delivery. You can decline location access and enter your address manually.</p>
              <p>If you have additional questions or require more information about our Privacy Policy, do not hesitate to contact us.</p>
              
              <h2 className="text-2xl font-bold text-foreground pt-4">Log Files</h2>
              <p>TreatStory follows a standard procedure of using log files. These files log visitors when they visit websites. All hosting companies do this and a part of hosting services' analytics. The information collected by log files include internet protocol (IP) addresses, browser type, Internet Service Provider (ISP), date and time stamp, referring/exit pages, and possibly the number of clicks. These are not linked to any information that is personally identifiable. The purpose of the information is for analyzing trends, administering the site, tracking users' movement on the website, and gathering demographic information.</p>

              <h2 className="text-2xl font-bold text-foreground pt-4">Cookies and Web Beacons</h2>
              <p>Like any other website, TreatStory uses 'cookies'. These cookies are used to store information including visitors' preferences, and the pages on the website that the visitor accessed or visited. The information is used to optimize the users' experience by customizing our web page content based on visitors' browser type and/or other information.</p>

              <h2 className="text-2xl font-bold text-foreground pt-4">Privacy Policies</h2>
              <p>You may consult this list to find the Privacy Policy for each of the advertising partners of TreatStory.</p>
              <p>Third-party ad servers or ad networks uses technologies like cookies, JavaScript, or Web Beacons that are used in their respective advertisements and links that appear on TreatStory, which are sent directly to users' browser. They automatically receive your IP address when this occurs. These technologies are used to measure the effectiveness of their advertising campaigns and/or to personalize the advertising content that you see on websites that you visit.</p>
              <p>Note that TreatStory has no access to or control over these cookies that are used by third-party advertisers.</p>
              
              <h2 className="text-2xl font-bold text-foreground pt-4">Online Privacy Policy Only</h2>
              <p>This Privacy Policy applies only to our online activities and is valid for visitors to our website with regards to the information that they shared and/or collect in TreatStory. This policy is not applicable to any information collected offline or via channels other than this website.</p>
            </div>
          </div>
        </div>
      </main>
      <footer className="py-8 bg-background text-center text-sm text-muted-foreground border-t">
        <div className="container flex flex-col md:flex-row justify-between items-center gap-4">
          <p>© {new Date().getFullYear()} TreatStory. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/terms-of-service" className="hover:text-primary transition-colors">Terms of Service</Link>
            <Link href="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
