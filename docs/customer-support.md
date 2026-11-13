# TreatStory customer support

Customers and sellers sign in and open `/support` to submit a subject, category and message. Categories cover orders, delivery, payments, sellers/products, accounts and other questions. An order ID is optional; when supplied it must belong to that buyer or seller. Each account can create up to five requests per India-calendar day. New requests start as `open`.

Only the ticket owner and verified administrators can read a ticket. Sellers do not automatically see another customer's support request. The API checks authentication and admin privileges; client-side database writes to tickets are prohibited.

Administrators open Admin → Customer support. The inbox displays the newest 100 tickets. An admin can send a response (status `responded`) or close the request (status `closed`). The customer sees the status and latest response live under Your support requests at `/support` (up to 50 tickets). The current system stores the latest admin response, not a full conversation. Customers needing follow-up submit a new request; closed tickets cannot currently be reopened.

Receipt, response and closure create an in-app notification and queue an email to the customer through the configured Apps Script relay. Setting `MAIL_SUPPORT_EMAIL` also queues a new-request email to that support inbox. Admins can still use the dashboard if this optional recipient is unset. Mail relay failures retry through the existing outbox/cron flow; queued or accepted mail is not proof of inbox delivery.

This is a manual support inbox, not live chat. Replying to an email does not automatically add a ticket message. A ticket does not automatically refund a payment, cancel an order or update delivery; admins must take the relevant action separately.


Encrypted messaging implementation, preserved legacy-history procedures and
release gates are documented in [support implementation status](support-implementation-status.md).
The stable ticket flow remains available at `/support-tickets`.
