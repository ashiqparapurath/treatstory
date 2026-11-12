'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, MessageCircle, Share2, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { storefrontShareUrl, storefrontWhatsAppUrl } from '@/lib/storefront-share';

export function StoreShareButton({
  sellerId,
  storeName,
  dark = false,
}: {
  sellerId: string;
  storeName: string;
  dark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const url = storefrontShareUrl(sellerId);
  const whatsapp = storefrontWhatsAppUrl(sellerId, storeName);

  useEffect(() => setCanNativeShare(typeof navigator.share === 'function'), []);
  function selectLink() {
    linkInput.current?.focus();
    linkInput.current?.select();
  }
  async function copyLink() {
    if (!navigator.clipboard?.writeText) {
      selectLink();
      toast({ title: 'Select and copy your store link', description: 'The link is highlighted below.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Store link copied', description: 'Share it with your customers anywhere.' });
      setOpen(false);
    } catch {
      selectLink();
      toast({ title: 'Select and copy your store link', description: 'The link is highlighted below.' });
    }
  }
  async function shareToApps() {
    if (!navigator.share) return;
    try {
      await navigator.share({ title: storeName + ' on TreatStory', text: 'Explore ' + storeName + ' on TreatStory', url });
      setOpen(false);
    } catch (error) {
      if ((error as { name?: string })?.name !== 'AbortError') {
        toast({ title: 'Choose another way to share', description: 'You can copy the link or share it on WhatsApp.' });
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={'Share store: ' + storeName}
          className={dark
            ? 'min-h-11 shrink-0 gap-2 rounded-full border-white/40 bg-white/10 px-4 text-xs font-semibold text-white hover:bg-white/20 hover:text-white'
            : 'min-h-11 shrink-0 gap-2 rounded-full border-[#ded4c7] bg-[#fbf9f6] px-4 text-xs font-semibold text-[#4e4030] hover:bg-[#f3ede4]'}
        >
          <Share2 className="h-4 w-4" />
          Share store
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[min(320px,calc(100vw-32px))] rounded-2xl border-[#e8e0d5] bg-[#fcfaf6] p-4 shadow-xl"
      >
        <p className="break-words text-sm font-semibold text-[#29251f]">Share {storeName}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Invite customers directly to your TreatStory storefront.</p>
        <div className="mt-4 grid gap-2">
          <Button type="button" variant="outline" onClick={() => void copyLink()} className="min-h-11 justify-start gap-2 bg-white text-xs">
            <Copy className="h-4 w-4" /> Copy store link
          </Button>
          <Button asChild variant="outline" className="min-h-11 justify-start gap-2 bg-white text-xs">
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              <MessageCircle className="h-4 w-4" /> Share on WhatsApp
            </a>
          </Button>
          {canNativeShare && <Button type="button" variant="outline" onClick={() => void shareToApps()} className="min-h-11 justify-start gap-2 bg-white text-xs">
            <Share2 className="h-4 w-4" /> Share to other apps
          </Button>}
          <Button asChild variant="outline" className="min-h-11 justify-start gap-2 bg-white text-xs">
            <Link href={'/shop/' + encodeURIComponent(sellerId)} onClick={() => setOpen(false)}>
              <ExternalLink className="h-4 w-4" /> View storefront
            </Link>
          </Button>
        </div>
        <input
          ref={linkInput}
          readOnly
          value={url}
          aria-label="Storefront link"
          onFocus={event => event.currentTarget.select()}
          onClick={event => event.currentTarget.select()}
          className="mt-3 h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-xs text-[#4e4030]"
        />
      </PopoverContent>
    </Popover>
  );
}
