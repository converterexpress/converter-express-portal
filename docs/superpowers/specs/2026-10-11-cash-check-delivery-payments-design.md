# Cash and Check on Delivery — Design

## Goal

Allow approved shop customers to choose cash or check at checkout while preserving the payment-first rule: a delivery request is not a confirmed order until an administrator records that payment was collected.

Online card payments continue through Whop without changing their existing behavior.

## Customer experience

Checkout presents three payment methods:

- Pay online securely with Whop
- Cash on delivery
- Check on delivery

Choosing Whop continues into the embedded Whop payment flow. Choosing cash or check submits a delivery payment request. The success screen clearly says that inventory is reserved, payment will be collected at delivery, and the order remains unconfirmed until Converter Express records the payment.

The customer cannot use the offline methods to bypass pricing, account approval, stock validation, delivery-address validation, or server-side total calculation.

## Payment and order state

Cash and check requests use the existing checkout reservation as the source of truth. A new offline-payment state records that the request is awaiting collection. The reservation stores the selected method, customer-visible request number, server-calculated amount, cart snapshot, delivery details, and expiration or cancellation information.

Creating the request reserves available inventory but does not create a confirmed order or paid invoice. The request remains visible to administrators until it is paid or cancelled.

When an administrator records collection, one database transaction:

1. Locks and validates the reservation.
2. Rejects duplicate, expired, cancelled, or already-finalized requests.
3. Creates the order using the server-owned reservation snapshot.
4. Records a cash or check payment for the full amount.
5. Stores the accepting administrator, collection timestamp, and optional check/reference number.
6. Marks the order paid and confirmed and links it to the reservation.

This transaction is idempotent so retries cannot create duplicate orders or payments.

## Admin experience

The admin area gains an **Awaiting delivery payment** queue. Each entry shows:

- Customer and shop
- Delivery address
- Requested payment method
- Items and total
- Request date and fulfillment timing
- Optional customer notes, PO, vehicle, and job information

An administrator can open an entry and choose **Record payment collected** or **Cancel request**. Recording payment requires confirming the method. Check payments also provide an optional check number; both methods support an optional internal note.

The confirmation screen states that this action creates and confirms the paid order. The resulting order, invoice, and audit history show the method, amount, timestamp, and administrator who accepted it.

Cancelling releases the inventory reservation and records who cancelled it and why. Finalized or cancelled requests cannot be edited or finalized again.

## Inventory behavior

Available stock is held when the customer submits the cash/check request. Reserved stock is not offered to another customer. Administrators can cancel stale or abandoned requests to release inventory. The first implementation will not silently confirm or charge any offline request.

The admin queue should make old requests easy to identify. Automatic expiration can be added later after the business chooses a reliable operational time limit; until then, cancellation is explicit to avoid releasing stock from a delivery already in progress.

## Data and API changes

The checkout reservation schema gains fields for:

- Payment method (`WHOP`, `CASH`, or `CHECK`)
- Offline-payment state
- Customer-visible request number
- Collection metadata and optional reference
- Accepting or cancelling administrator
- Cancellation timestamp and reason

Dedicated server actions create, list, inspect, finalize, and cancel offline requests. Authorization is enforced server-side. Customers may create and view only their own requests; only administrators may list all requests, record payment, cancel, or finalize them.

All prices, discounts, taxes, delivery charges, and inventory are recalculated or validated on the server before a request is accepted. Client-provided totals are never trusted.

## Notifications

Submitting cash/check sends the customer a branded **delivery payment request received** email and sends the business a new-request notification. The message avoids calling it a confirmed order.

After an administrator records payment, the existing paid order confirmation and invoice email are sent. Cancellation sends a short cancellation notice when an email address is available.

Notification failures are logged but do not reverse a successfully committed database transaction.

## Failure handling

- Insufficient stock prevents request creation and shows which item changed.
- A network retry returns the existing request rather than creating a duplicate.
- A second administrator attempting to finalize the same request receives the existing confirmed order.
- A cancelled request cannot be paid without creating a new checkout request.
- Whop webhook processing remains isolated from cash/check requests.
- The UI shows a useful error and preserves customer-entered checkout details when submission fails.

## Security and audit requirements

- Payment collection is an authenticated admin-only operation.
- Every status change records actor and timestamp.
- The browser cannot directly mark a reservation or order paid.
- Cash/check requests never use Whop identifiers or webhook verification paths.
- Sensitive server credentials remain in Supabase secrets and never enter frontend code.

## Testing and acceptance criteria

Automated tests cover:

- Checkout displays all three methods.
- Whop checkout still follows the existing online-payment path.
- Cash and check create pending delivery payment requests without confirmed orders.
- Stock is reserved once and released on cancellation.
- Customers cannot finalize their own offline requests.
- Admin finalization creates exactly one paid order and payment record.
- Repeated finalization is idempotent.
- Check reference and accepting administrator appear in invoice and audit data.
- Pending and cancelled requests are never represented as paid invoices.
- Server-side totals and inventory cannot be overridden by browser payloads.

Manual verification covers desktop and mobile checkout, admin queue usability, confirmation wording, email rendering, cancellation, and the final invoice/payment display.

## Deployment

Deploy the database migration and backend handlers before publishing the frontend controls. Existing Whop reservations and paid orders remain compatible. After deployment, test one cash request and one check request with temporary inventory, finalize one, cancel the other, verify inventory counts, and remove the test records.
