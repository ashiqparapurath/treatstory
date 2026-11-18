import { Instagram } from 'lucide-react';

/** Accessible social destination used by TreatStory's public page footers. */
export function FooterInstagramLink() {
  return (
    <a
      href="https://www.instagram.com/treatstory.in/"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="TreatStory on Instagram (opens in a new tab)"
      title="TreatStory on Instagram"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#895335] transition-colors hover:bg-[#f2e7dc] hover:text-[#754328] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#895335]"
    >
      <Instagram aria-hidden="true" className="h-5 w-5" />
    </a>
  );
}
