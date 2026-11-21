# TreatStory support and seller messaging

TreatStory has **two separate** plaintext support-ticket conversations (both use the same responsive full-screen conversation workspace and server-owned `/api/support` endpoint):

| Sender | Recipient | Where to open |
| --- | --- | --- |
| Buyer | The particular seller they selected | Buyer: a seller's public storefront → **Message seller**, a seller product → **Message seller on TreatStory**, or a buyer order → **Message seller about this order** |
| Seller | TreatStory administrators | Seller: **Help & Support** → `/support` |
| Seller replying to buyer | Buyer who started that conversation | Seller: **Customer messages** → `/seller/messages` |
| Admin replying to seller | Seller who started the platform-support ticket | Admin → **Customer support** |

The buyer's message belongs to **one seller** (the server stores the seller's verified UID as `sellerId`), not every seller and not the admin inbox. The buyer can start a conversation from a store page without placing an order. For order-linked conversations, the API verifies that the specified seller and buyer match that exact `seller_orders` record. An authenticated buyer who opens `/support` without a selected seller sees a prompt to choose a store, rather than accidentally submitting a message to admin.

Sellers contact the platform via `/support` with no recipient seller ID. The server verifies that they have a seller account before creating an admin ticket. Existing buyer-to-admin tickets from before this rollout are preserved as historical conversations; they can still be read and followed up on, rather than being silently rerouted.

## Permissions and delivery

- Ticket creation, replies, follow-ups, and closure use a server-authorized Firestore transaction. Direct browser writes are disabled by Firestore rules.
- Buyer: read and follow up on their **own** tickets; seller: see and respond to tickets with `route: seller` **and** `sellerId` equal to their verified account ID; admin: use the admin-only inbox for platform tickets. The seller inbox query restricts by both fields.
- The server refuses a reply/closure by a different seller, a buyer trying to reply as a seller, or an administrator trying to impersonate a seller through the seller route.
- Seller messages trigger an in-app notification and queued email for the intended seller; buyer replies trigger a notification to that seller. Seller replies notify the buyer. Seller-to-admin requests appear in the admin support inbox; optionally `MAIL_SUPPORT_EMAIL` sends a separate email to the support recipient.
- Email uses the existing outbox and configured Apps Script relay. Queued/accepted mail does not prove that the mailbox delivered it.
- Requests default to `open`; responder replies set `responded`; buyer follow-ups set `open` again. Admin or addressed seller can close their respective conversations. Closed tickets cannot be reopened.
- Up to **five new conversations per account per India-calendar day**. Subject: 5–140 characters; first message: 15–2000; reply: 5–2000. Threads cap at 80 appended messages.
- Never send account passwords, bank card details, or recovery codes. **This plaintext ticket system is not end-to-end encrypted** and is not a guaranteed instant live chat.

## Rollout

1. Deploy updated **Firestore rules and indexes** from this PR, including the composite `support_tickets (sellerId, route, updatedAt)`, `(route, updatedAt)` and `(ownerUid, updatedAt)` indexes. Check that the index is ready. Database rules and indexes are not automatically deployed by a Vercel app build.
2. Deploy the Next.js app with both experimental Matrix flags left **off**: `NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED=false` and `NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED=false`. The independent Matrix feature is not production-enabled and follows a different encrypted routing design; do not turn it on expecting this ticket routing to apply.
3. Test buyer A contacting store A; confirm only store A sees the ticket. Try store B and an unrelated account, and verify access is denied. Check that the admin inbox does not list the buyer-to-seller ticket.
4. Test seller A contacting admin, and verify it appears in Admin → Customer support and that the admin can reply.
5. Test new, follow-up, and closed conversations, plus the preserved prior admin tickets. Test mobile and desktop entry points.
6. Confirm that email and in-app notifications arrive; failed emails stay in the outbox for retry.

The old single-device encrypted support pilot remains retired. Matrix production readiness is documented in [support implementation status](support-implementation-status.md).


## Seller quotation chat (received quotations)

Sellers access **Received quotations** directly from the seller dashboard, linking to `/custom-orders?view=received`. This focused view shows requests addressed to the seller (product name, buyer's description, budget if provided, preferred date, optional private reference photo, current status) and retains the existing send-quote/decline actions.

Each received request has **Open buyer chat**:
1. The browser goes to `/seller/messages?quote=<quoteId>`. The seller's authenticated session sends `open_quote_chat` with only that quote ID.
2. The server transaction reads the quote, verifies it is addressed to the authenticated, active, **unexpired** seller and has a distinct buyer, and opens `support_tickets/quote_<quoteId>`. Repeated clicks return the same ticket with no duplicate conversation or duplicate buyer notification.
3. The ticket has `route: seller`, `ownerUid` equal to the verified **buyer UID**, `sellerId` equal to the authenticated seller UID and `quoteId` as the private reference. Opening creates a neutral **system** notice, not an authored message impersonating the seller.
4. The buyer receives an in-app notification linking directly to `/support?ticket=quote_<quoteId>`, which opens that buyer's existing full-screen ticket conversation after sign-in.
5. Sellers and buyers reply via the existing role-checked support API. Firestore rules expose these tickets to the buyer, addressed seller and admin oversight, and block direct client edits. The seller's inbox provides a link back to received quotations; both sides can return to the quote from chat.

Messages are **not end-to-end encrypted**. No unrestricted seller-to-buyer messaging endpoint was added; chat initiation requires an actual quotation received by that seller. The existing Matrix experimental flags stay off. No extra Firestore index is needed beyond the support ticket query indexes already included in the preceding routing PR.
