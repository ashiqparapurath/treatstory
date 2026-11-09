"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type InstallNavigator = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<
    { platform?: string; url?: string; id?: string }[]
  >;
};
const installedKey = "treatstory:app-installed";
const dismissedKey = "treatstory:install-dismissed";
function storage(
  kind: "localStorage" | "sessionStorage",
  key: string,
  value?: string,
) {
  try {
    if (value === undefined) return window[kind].getItem(key);
    if (value) window[kind].setItem(key, value);
    else window[kind].removeItem(key);
  } catch {
    /* Browsing still works when storage is disabled. */
  }
  return null;
}

export function AppInstallNotice() {
  const [visible, setVisible] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let installedObserved = false;
    const nav = navigator as InstallNavigator;
    const mode = window.matchMedia(
      "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)",
    );
    const isInstalledWindow = () =>
      mode.matches ||
      nav.standalone === true ||
      document.referrer.startsWith("android-app://");
    const isDismissed = () => storage("sessionStorage", dismissedKey) === "1";
    const installed = () => {
      installedObserved = true;
      storage("localStorage", installedKey, "1");
      setVisible(false);
      setInstallEvent(null);
    };
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      if (isInstalledWindow()) {
        installed();
        return;
      }
      installedObserved = false;
      // Receiving this event means the browser considers this app installable again.
      storage("localStorage", installedKey, "");
      setInstallEvent(event as InstallEvent);
      if (!isDismissed()) setVisible(true);
    };
    const modeChanged = () => {
      if (isInstalledWindow()) installed();
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    mode.addEventListener("change", modeChanged);
    setIos(
      /iPad|iPhone|iPod/.test(nav.userAgent) ||
        (nav.platform === "MacIntel" && nav.maxTouchPoints > 1),
    );
    if (isInstalledWindow()) installed();
    else {
      const showIfEligible = () => {
        if (active && !installedObserved)
          setVisible(
            !isDismissed() && storage("localStorage", installedKey) !== "1",
          );
      };
      if (!nav.getInstalledRelatedApps) showIfEligible();
      else
        void Promise.resolve()
          .then(() => nav.getInstalledRelatedApps!())
          .then((apps) => {
            if (!active || installedObserved) return;
            const ownApp = apps.some((app) => {
              try {
                return (
                  app.platform === "webapp" &&
                  new URL(app.url || app.id || "").origin === location.origin
                );
              } catch {
                return false;
              }
            });
            if (ownApp || isInstalledWindow()) installed();
            else showIfEligible();
          })
          .catch(() => {
            showIfEligible();
          });
    }
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
      mode.removeEventListener("change", modeChanged);
    };
  }, []);
  function dismiss() {
    storage("sessionStorage", dismissedKey, "1");
    setVisible(false);
  }
  async function install() {
    if (!installEvent || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      // Must be called from the tap, not automatically on page load.
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted")
        storage("localStorage", installedKey, "1");
      dismiss();
      setInstallEvent(null);
    } catch {
      setInstallEvent(null);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  if (!visible) return null;
  return (
    <aside
      role="region"
      aria-label="Install TreatStory"
      className="fixed inset-x-3 top-[calc(76px+env(safe-area-inset-top))] z-50 mx-auto max-w-sm rounded-2xl border border-[#e8e0d5] bg-[#fcfaf6] p-4 shadow-xl md:left-auto md:right-6 md:top-24 md:mx-0"
    >
      <div className="flex items-start gap-3">
        <Download className="mt-1 h-5 w-5 shrink-0 text-[#846b49]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Keep TreatStory close</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Add TreatStory to your home screen for easy access.
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss install notification"
          onClick={dismiss}
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {installEvent ? (
        <Button
          type="button"
          disabled={busy}
          onClick={() => void install()}
          className="mt-3 h-11 w-full rounded-full"
        >
          {busy ? "Opening install…" : "Install TreatStory"}
        </Button>
      ) : (
        <p className="mt-3 text-xs leading-5 text-[#675d53]">
          {failed ? "Use your browser menu to install: " : ""}
          {ios
            ? "In Safari, tap Share, then Add to Home Screen."
            : "Open your browser menu and choose Install app or Add to Home Screen, if available."}
        </p>
      )}
    </aside>
  );
}
