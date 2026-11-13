# TreatStory customer support

Customers and sellers sign in and open `/support` to submit a subject, category and message. Categories cover orders, delivery, payments, sellers/products, accounts and other questions. An order ID is optional; when supplied it must belong to that buyer or seller. Each account can create up to five requests per India-calendar day. New requests start as `open`.

Only the ticket owner and verified administrators can read a ticket. Sellers do not automatically see another customer's support request. The API checks authentication and admin privileges; client-side database writes to tickets are prohibited.

Administrators open Admin → Customer support. The inbox displays the most recently updated 100 tickets in a full-screen conversation workspace. Buyers and sellers see their own 50 most recent loaded tickets in the same full-screen interface at `/support` (or `/support-tickets`). The existing `/api/support` is the server-authorized message transport: the ticket owner may send follow-up messages to their open request, and an administrator may reply or close it. Replies are stored in a bounded server-owned `thread` array in the original ticket document; the original request and any previous single-response legacy text are preserved and displayed as conversation bubbles. A follow-up reopens a replied ticket for staff attention. Closed tickets cannot be reopened; a new request is required.

Receipt, response and closure create an in-app notification and queue an email to the customer through the configured Apps Script relay. Setting `MAIL_SUPPORT_EMAIL` also queues a new-request email to that support inbox. Admins can still use the dashboard if this optional recipient is unset. Mail relay failures retry through the existing outbox/cron flow; queued or accepted mail is not proof of inbox delivery.

This is an asynchronous, **plaintext (not end-to-end encrypted)** support conversation interface, with Firestore-driven updates, not the Matrix live encrypted chat. Do not share account passwords, payment card numbers, or recovery secrets in tickets. Support is not guaranteed to respond immediately. Replying to an email does not automatically add a ticket message. A ticket does not automatically refund a payment, cancel an order or update delivery; admins must take the relevant action separately.


Encrypted messaging implementation, preserved legacy-history procedures and
release gates are documented in [support implementation status](support-implementation-status.md).
The stable ticket flow remains available at `/support-tickets`.
