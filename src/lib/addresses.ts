import { z } from "zod";
export const deliveryAddressSchema = z
  .object({
    recipient: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(5).max(40),
    line1: z.string().trim().min(10).max(600),
    locality: z.string().trim().max(120),
    district: z.string().trim().min(1).max(120),
    state: z.string().trim().min(1).max(120),
    pincode: z.string().regex(/^\d{6}$/),
  })
  .strict();
export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;
export type SavedAddress = DeliveryAddress & { id: string };
export type AddressBook = {
  addresses: SavedAddress[];
  defaultId: string | null;
};
const id = z.string().regex(/^(legacy|[0-9a-f-]{36})$/i);
export const addressActionSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("save"), id, address: deliveryAddressSchema })
    .strict(),
  z.object({ action: z.literal("default"), id }).strict(),
  z.object({ action: z.literal("remove"), id }).strict(),
]);
export const addressText = (a: DeliveryAddress) =>
  [a.line1, a.locality, a.district, a.state, a.pincode]
    .filter(Boolean)
    .join(", ");
export const emptyAddress: DeliveryAddress = {
  recipient: "",
  phone: "",
  line1: "",
  locality: "",
  district: "",
  state: "",
  pincode: "",
};
export function savedAddressOptions(
  book: AddressBook | null | undefined,
  legacy: DeliveryAddress | null | undefined,
): SavedAddress[] {
  return book
    ? book.addresses
    : legacy
      ? [
          {
            recipient: legacy.recipient,
            phone: legacy.phone,
            line1: legacy.line1,
            locality: legacy.locality || "",
            district: legacy.district,
            state: legacy.state,
            pincode: legacy.pincode,
            id: "legacy",
          },
        ]
      : [];
}
export function changeAddressBook(
  book: AddressBook,
  action: z.infer<typeof addressActionSchema>,
): AddressBook {
  let addresses = book.addresses.map((a) => ({ ...a })),
    defaultId = book.defaultId;
  const index = addresses.findIndex((a) => a.id === action.id);
  if (action.action === "save") {
    if (index < 0) {
      if (addresses.length >= 10) throw new Error("ADDRESS_LIMIT");
      addresses.push({ ...action.address, id: action.id });
    } else addresses[index] = { ...action.address, id: action.id };
    if (!defaultId) defaultId = action.id;
  } else {
    if (index < 0) throw new Error("ADDRESS_NOT_FOUND");
    if (action.action === "remove") {
      addresses = addresses.filter((a) => a.id !== action.id);
      if (defaultId === action.id) defaultId = addresses[0]?.id ?? null;
    } else defaultId = action.id;
  }
  return { addresses, defaultId };
}
