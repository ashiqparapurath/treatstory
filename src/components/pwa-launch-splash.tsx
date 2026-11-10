"use client";

import { useEffect } from "react";
import branding from "@/lib/pwa-branding.json";

export function PwaLaunchSplash() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute("data-pwa-launch")) return;
    let second = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (!root.hasAttribute("data-pwa-launch")) return;
        root.setAttribute("data-pwa-launch", "ready");
        timer = setTimeout(() => root.removeAttribute("data-pwa-launch"), 160);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      clearTimeout(timer);
      root.removeAttribute("data-pwa-launch");
    };
  }, []);
  return (
    <div
      className="pwa-launch-splash"
      style={{ backgroundColor: branding.background }}
      role="status"
      aria-label="Opening TreatStory"
      aria-live="polite"
    >
      <img
        src={branding.artwork}
        alt="TreatStory — Since 2026"
        width={1562}
        height={1007}
        loading="lazy"
        fetchPriority="high"
        decoding="sync"
      />
    </div>
  );
}
