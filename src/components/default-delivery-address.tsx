"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useAccountData, useUser } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { errorToast, ActionError } from "@/lib/user-notices";
import {
  addressText,
  emptyAddress,
  savedAddressOptions,
  deliveryAddressSchema,
  type DeliveryAddress,
  type SavedAddress,
} from "@/lib/addresses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MapPin, Search, LocateFixed } from "lucide-react";
export { addressText, emptyAddress } from "@/lib/addresses";
export type { DeliveryAddress } from "@/lib/addresses";

export function SavedAddressList({
  onSelect,
  selectedId,
}: {
  onSelect?: (address: SavedAddress) => void;
  selectedId?: string | null;
}) {
  const { user } = useUser();
  const { toast } = useToast();
  const {
    address: savedAddress,
    addressBook,
    addressLoading,
    addressBookLoading,
    addressBookError,
  } = useAccountData();
  const addresses = savedAddressOptions(addressBook, savedAddress),
    defaultId = addressBook?.defaultId ?? (savedAddress ? "legacy" : null);
  const [editing, setEditing] = useState(false),
    [editId, setEditId] = useState(""),
    [a, setA] = useState<DeliveryAddress>(emptyAddress),
    [busy, setBusy] = useState(false),
    [lookup, setLookup] = useState(false),
    [areas, setAreas] = useState<string[]>([]);
  const currentPin = useRef(a.pincode);
  currentPin.current = a.pincode;
  const pinId = useId();
  const streetId = useId();
  const version = useRef(0);
  const [locating, setLocating] = useState(false);
  const [locationSuggested, setLocationSuggested] = useState(false);
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  function closeEditor(open: boolean) {
    if (busy) return;
    if (!open) {
      version.current++;
      setLocating(false);
      setLookup(false);
    }
    setEditing(open);
  }
  async function useLocation() {
    if (!user || locating) return;
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "Location is not supported",
        description: "Enter your delivery address manually.",
      });
      return;
    }
    const current = version.current,
      initial = { ...a };
    setLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 0,
          }),
      );
      if (current !== version.current) return;
      const response = await fetch("/api/addresses/location", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (current !== version.current) return;
      if (!response.ok)
        throw new ActionError(
          data.error || "Could not find address details for your location.",
          response.status,
        );
      setA((value) => {
        const next = { ...value };
        for (const key of ["locality", "district", "state", "pincode"] as const)
          if (value[key] === initial[key])
            next[key] = typeof data[key] === "string" ? data[key] : "";
        return next;
      });
      setAreas([]);
      setLocationSuggested(true);
      toast({
        title: "Area suggested from your location",
        description:
          "Check your locality, district, state and PIN. Add your house or apartment and street before saving.",
      });
    } catch (error) {
      if (current !== version.current) return;
      const code = (error as { code?: number })?.code;
      toast(
        code === 1
          ? {
              variant: "destructive",
              title: "Location access was not allowed",
              description:
                "You can enable it in your browser settings or enter the address manually.",
            }
          : code === 2 || code === 3
            ? {
                variant: "destructive",
                title:
                  code === 3
                    ? "Location request timed out"
                    : "Could not find your location",
                description: "Try again or enter the address manually.",
              }
            : {
                variant: "destructive",
                title: "Could not suggest your address",
                description:
                  error instanceof ActionError
                    ? error.message
                    : "Try again or enter your address manually.",
              },
      );
    } finally {
      if (current === version.current) setLocating(false);
    }
  }
  const change = (key: keyof DeliveryAddress, value: string) =>
    setA((v) => ({ ...v, [key]: value }));
  function openEditor(value?: SavedAddress) {
    version.current++;
    setLocating(false);
    setLocationSuggested(false);
    setEditId(value?.id ?? crypto.randomUUID());
    setA(
      value
        ? {
            recipient: value.recipient,
            phone: value.phone,
            line1: value.line1,
            locality: value.locality,
            district: value.district,
            state: value.state,
            pincode: value.pincode,
          }
        : emptyAddress,
    );
    setAreas([]);
    setEditing(true);
  }
  async function mutate(action: Record<string, unknown>) {
    if (!user || busy) return null;
    setBusy(true);
    try {
      const response = await fetch("/api/addresses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify(action),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new ActionError(
          payload.error || "Could not update your addresses.",
          response.status,
        );
      return payload;
    } catch (error) {
      toast(errorToast(error, "save-address"));
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function lookupPin() {
    const current = version.current,
      queriedPin = a.pincode;
    if (!/^\d{6}$/.test(a.pincode)) {
      toast({
        variant: "destructive",
        title: "Enter a valid 6-digit Indian PIN code",
      });
      return;
    }
    setLookup(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      let response: Response;
      try {
        response = await fetch(
          `https://api.postalpincode.in/pincode/${queriedPin}`,
          { signal: controller.signal },
        );
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw new Error("PIN lookup unavailable");
      const data = await response.json();
      const offices = data?.[0]?.PostOffice;
      if (!Array.isArray(offices) || !offices.length)
        throw new Error("PIN code not found");
      if (current !== version.current || currentPin.current !== queriedPin)
        return;
      const names = Array.from(
        new Set(offices.map((v: { Name: string }) => v.Name).filter(Boolean)),
      ) as string[];
      setAreas(names);
      setA((v) => ({
        ...v,
        district: offices[0].District || "",
        state: offices[0].State || "",
        locality: names.includes(v.locality) ? v.locality : names[0] || "",
      }));
      toast({
        title: "Location found",
        description: "Please verify your locality and district.",
      });
    } catch {
      if (current !== version.current) return;
      toast({
        variant: "destructive",
        title: "Could not look up PIN code",
        description: "You can enter district, state and locality manually.",
      });
    } finally {
      if (current === version.current) setLookup(false);
    }
  }

  async function save() {
    if (locating || busy || lookup) return;
    const parsed = deliveryAddressSchema.safeParse(a);
    if (!parsed.success) {
      toast({
        variant: "destructive",
        title: "Check your delivery details",
        description:
          "Add a name, phone, complete street address, district, state and six-digit PIN.",
      });
      return;
    }
    if (await mutate({ action: "save", id: editId, address: parsed.data })) {
      version.current++;
      setEditing(false);
      toast({ title: "Delivery address saved" });
      onSelect?.({ ...parsed.data, id: editId });
    }
  }
  return (
    <div className="space-y-3">
      {addressLoading || addressBookLoading ? (
        <p role="status" className="text-xs">
          Loading saved addresses…
        </p>
      ) : addressBookError ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 p-3 text-xs"
        >
          Could not load your saved addresses. Refresh to try again. You can
          still enter an address for this order.
        </p>
      ) : (
        <>
          {addresses.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No saved addresses yet. Add one for faster checkout.
            </p>
          )}
          {addresses.map((item) => (
            <article
              key={item.id}
              className={`rounded-xl border p-3 ${selectedId === item.id ? "border-[#a68a64] bg-[#fffaf3]" : "bg-[#faf8f4]"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {item.recipient}
                    {item.id === defaultId && (
                      <span className="ml-2 text-[10px] font-normal text-[#846b49]">
                        Default
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs">{item.phone}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {addressText(item)}
                  </p>
                </div>
                {onSelect && (
                  <Button
                    type="button"
                    size="sm"
                    variant={selectedId === item.id ? "default" : "outline"}
                    onClick={() => onSelect(item)}
                    aria-label={`Deliver to ${item.recipient}, ${item.pincode}`}
                  >
                    Use
                  </Button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => openEditor(item)}
                  aria-label={`Edit address for ${item.recipient}`}
                >
                  Edit
                </Button>
                {item.id !== defaultId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      if (await mutate({ action: "default", id: item.id }))
                        toast({ title: "Default address updated" });
                    }}
                  >
                    Make default
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    if (await mutate({ action: "remove", id: item.id }))
                      toast({ title: "Address removed" });
                  }}
                  aria-label={`Remove address for ${item.recipient}`}
                >
                  Remove
                </Button>
              </div>
            </article>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full"
            disabled={busy || addresses.length >= 10}
            onClick={() => openEditor()}
          >
            Add new address
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Save up to 10 addresses. Switching at checkout does not change your
            default.
          </p>
        </>
      )}
      <Dialog open={editing} onOpenChange={closeEditor}>
        <DialogContent className="max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {addresses.some((item) => item.id === editId)
                ? "Edit address"
                : "Add address"}
            </DialogTitle>
            <DialogDescription>
              Save delivery details to your address book.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-xl border bg-[#faf8f4] p-3">
            <Button
              type="button"
              variant="outline"
              disabled={locating || busy || lookup}
              onClick={() => void useLocation()}
              className="h-11 rounded-full"
            >
              <LocateFixed className="mr-2 h-4 w-4" />
              {locating ? "Finding your location…" : "Use my location"}
            </Button>
            <p className="text-[11px] leading-5 text-muted-foreground">
              With your permission, your coordinates are shared with our map
              provider to suggest area details. Only the address you confirm is
              saved.
            </p>
            {locationSuggested && (
              <p className="text-xs text-[#846b49]">
                Confirm these suggestions before saving.
              </p>
            )}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] underline"
            >
              Location data © OpenStreetMap contributors
            </a>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium">
              Recipient name
              <Input
                className="mt-2"
                value={a.recipient}
                maxLength={120}
                onChange={(e) => change("recipient", e.target.value)}
              />
            </label>
            <label className="text-xs font-medium">
              Phone number
              <Input
                className="mt-2"
                value={a.phone}
                maxLength={40}
                onChange={(e) => change("phone", e.target.value)}
              />
            </label>
            <div className="text-xs font-medium sm:col-span-2">
              <label htmlFor={streetId}>House / building, street</label>
              <Textarea
                id={streetId}
                rows={2}
                className="mt-2 min-h-16 resize-y"
                value={a.line1}
                maxLength={600}
                onChange={(e) => change("line1", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={pinId} className="text-xs font-medium">
                PIN code
              </label>
              <div className="mt-2 flex gap-2">
                <Input
                  id={pinId}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit PIN"
                  value={a.pincode}
                  onChange={(e) => {
                    change("pincode", e.target.value.replace(/\D/g, ""));
                    setAreas([]);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={lookup || locating}
                  onClick={lookupPin}
                  className="shrink-0"
                >
                  <Search className="mr-2 h-4 w-4" />
                  {lookup ? "Finding…" : "Find location"}
                </Button>
              </div>
            </div>
            <label className="text-xs font-medium">
              Locality / post office
              {areas.length > 0 ? (
                <select
                  className="mt-2 h-10 w-full rounded-md border bg-white px-3 text-sm"
                  value={a.locality}
                  onChange={(e) => change("locality", e.target.value)}
                >
                  {areas.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  className="mt-2"
                  value={a.locality}
                  maxLength={120}
                  onChange={(e) => change("locality", e.target.value)}
                />
              )}
            </label>
            <label className="text-xs font-medium">
              District
              <Input
                className="mt-2"
                value={a.district}
                maxLength={120}
                onChange={(e) => change("district", e.target.value)}
              />
            </label>
            <label className="text-xs font-medium">
              State
              <Input
                className="mt-2"
                value={a.state}
                maxLength={120}
                onChange={(e) => change("state", e.target.value)}
              />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || locating || lookup}
              onClick={() => void save()}
              className="h-11 rounded-full"
            >
              {busy ? "Saving…" : "Save address"}
            </Button>
            <Button
              type="button"
              disabled={busy}
              variant="outline"
              onClick={() => closeEditor(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function DefaultDeliveryAddress({
  onSaved,
}: {
  onSaved?: (a: DeliveryAddress) => void;
}) {
  return (
    <section className="w-full max-w-2xl space-y-4 rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:rounded-3xl sm:p-6">
      <div className="flex items-center gap-3">
        <MapPin className="h-5 w-5 text-[#a68a64]" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a68a64]">
            Address book
          </p>
          <h2 className="mt-1 text-xl font-medium">Saved delivery addresses</h2>
        </div>
      </div>
      <SavedAddressList
        onSelect={onSaved ? (address) => onSaved(address) : undefined}
      />
    </section>
  );
}
