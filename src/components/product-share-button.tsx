"use client";
import { useEffect, useRef, useState } from "react";
import { Share2, Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { errorToast } from "@/lib/user-notices";
export function ProductShareButton({
  productRoute,
  title,
}: {
  productRoute: string;
  title: string;
}) {
  const [url, setUrl] = useState(""),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  useEffect(() => {
    setUrl(
      new URL(
        "/product/" + encodeURIComponent(productRoute),
        window.location.origin,
      ).href,
    );
    setOpen(false);
  }, [productRoute]);
  async function nativeShare() {
    if (busy) return;
    setBusy(true);
    try {
      await navigator.share({
        title,
        text: `Discover ${title} on TreatStory.`,
        url,
      });
    } catch (error) {
      if ((error as { name?: string })?.name !== "AbortError") setOpen(true);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!navigator.clipboard?.writeText) {
      input.current?.select();
      toast({
        title: "Select and copy the product link",
        description: "The link is ready below.",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Product link copied",
        description: "Paste it into any app to share this creation.",
      });
      setOpen(false);
    } catch (error) {
      input.current?.select();
      toast(errorToast(error, "copy"));
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={!url || busy}
          aria-label={`Share ${title}`}
          className="h-11 shrink-0 rounded-full bg-white px-4 text-xs"
          onClick={(event) => {
            if (typeof navigator.share === "function") {
              event.preventDefault();
              void nativeShare();
            }
          }}
        >
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(320px,calc(100vw-32px))] rounded-2xl border-[#e8e0d5] bg-[#fcfaf6] p-4"
      >
        <p className="text-sm font-semibold">Share this creation</p>
        <div className="mt-3 grid gap-2">
          <Button
            variant="outline"
            type="button"
            className="justify-start bg-white"
            onClick={() => void copy()}
          >
            <Copy className="h-4 w-4" />
            Copy product link
          </Button>
          <Button
            variant="outline"
            type="button"
            className="justify-start bg-white"
            onClick={() => {
              window.open(
                "https://wa.me/?text=" + encodeURIComponent(`${title}\n${url}`),
                "_blank",
                "noopener,noreferrer",
              );
              setOpen(false);
            }}
          >
            <MessageCircle className="h-4 w-4" />
            Share on WhatsApp
          </Button>
        </div>
        <input
          ref={input}
          readOnly
          value={url}
          aria-label="Product link"
          onClick={(event) => event.currentTarget.select()}
          className="mt-3 h-10 w-full rounded-lg border bg-white px-2 text-xs"
        />
      </PopoverContent>
    </Popover>
  );
}
