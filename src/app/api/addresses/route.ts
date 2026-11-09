import type { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import {
  verifiedUser,
  ApiError,
  safeResponse,
} from "@/lib/server/firebase-admin";
import { readJsonBody } from "@/lib/server/request-body";
import {
  addressActionSchema,
  changeAddressBook,
  savedAddressOptions,
  type AddressBook,
  type DeliveryAddress,
} from "@/lib/addresses";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const { uid, db } = await verifiedUser(request);
    const parsed = addressActionSchema.safeParse(
      await readJsonBody(request, 5000),
    );
    if (!parsed.success)
      throw new ApiError(
        400,
        "Check the recipient, phone, complete address and six-digit PIN code.",
      );
    const bookRef = db.collection("customer_address_books").doc(uid),
      defaultRef = db.collection("customer_addresses").doc(uid);
    const book = await db.runTransaction(async (tx) => {
      const [bookSnap, legacy] = await Promise.all([
        tx.get(bookRef),
        tx.get(defaultRef),
      ]);
      const current = bookSnap.exists
        ? (bookSnap.data() as AddressBook)
        : {
            addresses: savedAddressOptions(
              null,
              legacy.exists ? (legacy.data() as DeliveryAddress) : null,
            ),
            defaultId: legacy.exists ? "legacy" : null,
          };
      let next: AddressBook;
      try {
        next = changeAddressBook(current, parsed.data);
      } catch (error) {
        throw new ApiError(
          (error as Error).message === "ADDRESS_LIMIT" ? 409 : 404,
          (error as Error).message === "ADDRESS_LIMIT"
            ? "You can save up to 10 addresses. Remove one before adding another."
            : "This address was removed. Choose another address.",
        );
      }
      const updatedAt = Timestamp.now();
      tx.set(bookRef, { ...next, updatedAt });
      const selected = next.addresses.find((a) => a.id === next.defaultId);
      if (selected) {
        const { id, ...address } = selected;
        tx.set(defaultRef, { ...address, updatedAt });
      } else tx.delete(defaultRef);
      return next;
    });
    return Response.json(book, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeResponse(error);
  }
}
