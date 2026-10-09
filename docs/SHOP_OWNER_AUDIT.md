# Converter Express Shop Owner Audit

**Audit date:** October 9, 2026  
**Audited repository:** `converter-express-portal`  
**Public site checked:** <https://www.converterexpress.net/>  
**Audit type:** inspection and non-destructive testing only. No application code, production records, payments, refunds, or outbound customer messages were changed.

## 1. Executive Summary

Converter Express is a credible wholesale catalytic-converter ordering portal with a useful internal operations workspace. It is not yet a complete auto-repair shop management system. Its strongest end-to-end path is: approved shop account → catalog or vehicle fitment search → server-priced order → invoice → Whop payment → delivery tracking → return/warranty request. The admin side adds account approval, phone orders, inventory, purchase receiving, quotes, follow-ups, dispatch, invoice reconciliation, discounts, and basic profitability.

The product has better security and transaction controls than the interface initially suggests. Business data is held behind Edge Functions, customer projections are scoped, server rules calculate prices and reserve stock, staff access comes from a server-maintained allowlist, license files are private, workspace writes use optimistic concurrency, and Whop webhook processing verifies the payment before closing an invoice. The automated suite passed **63 unit tests across 7 files** and **20 browser workflow files** during this audit.

It is **not ready for unattended use by paying customers today**. The public Terms and Privacy pages say they are demo drafts; the Terms say online payment is disconnected while Whop payment is present; the Privacy page names Stripe even though the current processor is Whop. Order cancellation does not perform or track a refund, the order CSV exports every payment as “Card,” quote “Sent” is only a manually selected label, and staff have one unrestricted administrator role. These create legal, accounting, customer-service, and operational risk.

This product can be launched as a **wholesale supplier portal operated by a small trusted team** after the P0 items below are fixed and a supervised production acceptance test is completed. It should not be marketed as software that runs an automotive repair shop. Appointments, technician scheduling, repair orders, inspections, labor, payroll/time clocks, and full accounting are outside its implemented scope.

### Evidence and scope

| Evidence class | What was checked | Result / limitation |
|---|---|---|
| Live public HTTP | Homepage, Terms, Privacy, sitemap, robots, config, production HTML | Site responded. Production HTML contains the demo legal warning, obsolete “online payments are not connected” text, Stripe wording, and legacy “Local preview” strings. |
| Synthetic browser workflows | Chrome with application code and explicit in-memory Auth/API mocks | 20/20 browser files passed. These verify UI workflows and responsive layouts, but not hosted Supabase, Resend delivery, or a real Whop charge. |
| Unit/business-rule tests | Authorization, projections, pricing, stock, idempotency, deletion, email, payment/webhook rules | 63/63 tests passed. |
| Code and schema review | Routes, forms, business rules, Edge Functions, migrations, storage, integrations | Completed across the public site, customer portal, admin modules, Supabase functions, and migrations. |
| Production authenticated testing | Real signup, staff login, private records, emails, and payment | Deliberately not executed: no disposable production credentials were provided and the brief prohibits real messages, payments, destructive operations, or customer data use. |
| Database integration tests | SQL scripts exist for database authorization/audit/storage checks | Not run in this audit because they require a configured database connection. Their existence is evidence of intent, not a passing production result. |

## 2. Feature Inventory

### Public storefront

| Module | Current capability | Condition |
|---|---|---|
| Homepage | Hero, phone CTA, part-number/manufacturer search, vehicle finder, featured parts, catalog series, delivery messaging, first-order offer, FAQ | Browser-tested on 320/390/430 px and desktop; good visual foundation. |
| Catalog | Search, categories/series, pagination, part cards, stock/delivery indicators | Browser-tested with synthetic catalog data. |
| Part detail | Price gating, description, fitment information, cart, save part, photo request by email-client link | Code-reviewed; photo request depends on the visitor's mail client. |
| Vehicle fitment | Year/make/model/engine/test-group cascade, paginated supplier lookup, compatible in-stock catalog ranking | Browser/unit-tested with mocked API. External supplier availability was not live-tested. |
| Cart and checkout | Quantity editing, shipping/pickup, address, job/vehicle/PO information, discount and server quote | Browser/unit-tested. Server business rules prevent client-owned totals and overselling. |
| About, contact, returns | Company positioning, phone/email/service area, return/warranty process | Public and code-reviewed. Contact has no server-side ticket/form workflow. |
| SEO | Static build, clean routes, sitemap, robots, titles/schema assets | Live endpoints responded. Hash routes still drive much of the app experience. |
| Terms and privacy | Public legal pages | **Fail:** draft warnings and factually stale processor/payment copy are live. |

### Shop account portal

| Module | Current capability | Condition |
|---|---|---|
| Registration | Email/password, email verification, shop profile, private license upload, approval gate | Browser-tested with mocks; hosted mail deliverability not tested. |
| Sign in/recovery | Supabase password login, branded UI, forgot password, recovery callback | Browser-tested with mocks. |
| Shop dashboard | Order history, filters/search, delivery status, repeat order, quick part order | Browser-tested in connected mock flow. Production page still ships a stale “Local preview” string in source. |
| Profile | Shop/contact/address/delivery instructions | Code-reviewed and server-scoped. |
| Saved parts | Save/remove frequently used parts | Browser/code-reviewed. |
| Invoices | Open balances, invoice detail, printable view, embedded Whop payment with hosted fallback | Browser/unit-tested; no real charge was made. |
| Service requests | Customer creates return/warranty request against a purchased part, optional photos; staff resolves with response | Browser/unit-tested with synthetic records. No return merchandise authorization, label, replacement shipment, credit, or refund workflow. |

### Admin workspace

| Module | Current capability | Condition |
|---|---|---|
| Overview | Action queue, order/account/inventory metrics, activity, cost/fees/profit breakdown | Browser-tested. This is order-value reporting, not full accounting. |
| Accounts | Pending review, license view, approve/reject, profile, history, terms, negotiated pricing | Browser-tested with private-file URL mocked. |
| Orders | Search/filter, phone/walk-in order, lifecycle stage, cancel/reinstate, CSV export | Core path works; cancellation/refund and CSV payment method are defective/incomplete. |
| Invoices | Open/overdue/partial/closed views, search/sort, manual payment details and close, Whop checkout | Browser/unit-tested. No credit memo, refund, void, or write-off. |
| Quotes | Draft, line pricing, status, expiry, follow-up, accepted quote conversion | Incomplete: “Sent” is an offline status only. |
| Follow-ups | Owner text, due date, shop/quote link, completion | Works as a shared task list; no actual users, notifications, calendar, recurrence, or workload view. |
| Dispatch | Area, driver text, sequence, delivery date/window, depart, receiver confirmation | Works as a basic same-day delivery board. No driver accounts, routing, proof photo/signature, or notifications. |
| Products/series | Add/edit/delete parts and series, manufacturer, fitment metadata, prices/costs | Browser/unit-tested. Manual data entry is the primary catalog path. |
| Inventory | On-hand/minimum/reserved/available/incoming, adjustments and protections | Browser/unit-tested. No location/bin, cycle counts, transfers, valuation, or barcode flow. |
| Purchasing | Create PO, partial receipt, complete/cancel, incoming stock | Works internally; supplier order must be sent separately. Costs, bills, and vendor records are shallow. |
| Discounts | Add/activate/delete codes, first-order offer | Code/browser-tested. |
| Returns/warranty | Work queue, filters/search, customer case detail, response/resolution | Useful intake queue; downstream return/replacement/credit work is manual. |
| Settings | Contact, pickup, service area, shipping, tax, custom series, profit assumptions | Functional, but no onboarding checklist or validation against tax/delivery policy. |
| Data export | Orders CSV | Present, but payment-method field is incorrect. No complete backup/export. |

### Platform and integrations

| Area | Implementation | Assessment |
|---|---|---|
| Authentication | Supabase Auth; staff status checked against private `staff` table | Sound boundary; one all-powerful staff role. |
| Data persistence | One private JSONB workspace row with revision compare-and-swap | Safe against silent concurrent overwrite, but creates scale, audit, query, and recovery constraints. |
| Authorization | Edge Function commands plus customer-specific projections | Strong for present scope; tested against metadata role forgery and cross-customer reads. |
| Business license storage | Private Supabase bucket, owner-path uploads, signed admin download | Appropriate design; no retention/deletion workflow. |
| Email | Resend for order confirmation/invoice; Supabase SMTP for auth | Order email state distinguishes provider acceptance from delivery. Quotes and operational updates are not sent. |
| Payments | Whop Payment Elements/hosted fallback plus verified webhook | Defensive amount/merchant/reference checks exist. Refunds and disputes are absent. |
| Fitment | External lookup through API plus local catalog matching/ranking | Valuable dependency; no visible operational monitoring or supplier fallback. |
| Audit | One database audit row per workspace commit; selected CRM activity records | Too coarse to reconstruct which fields changed in a large admin save. |

## 3. Confirmed Bugs

### BUG-001 — Critical — Terms and Privacy are explicitly unfinished in production

- **Page/module:** `/terms`, `/privacy`
- **Description:** Both pages display “Placeholder draft for demo purposes only… Replace before this site goes live.”
- **Steps to reproduce:** Open the live site, choose Terms or Privacy in the footer.
- **Expected:** Approved, accurate legal policies suitable for a live wholesale commerce site.
- **Actual:** A visible warning says the policies are drafts.
- **Evidence:** Live production HTML on October 9 contained the warning. Source: `supabase-app/converter-express_1.html:1841` and `:1865`.
- **Suggested fix:** Have counsel approve business-specific Terms, Privacy, returns, warranty, California privacy, payment, shipping, and account terms; publish effective dates and contact details.

### BUG-002 — High — Legal/payment disclosures contradict the implemented checkout

- **Page/module:** Terms, Privacy, invoices
- **Description:** Terms say online payments are not connected; Privacy says payments use Stripe. The application implements Whop payment and exposes it on payable invoices.
- **Steps to reproduce:** Read Terms “Orders & payment,” Privacy “Payment information,” then inspect a payable invoice.
- **Expected:** All public disclosures identify the actual processor and current payment behavior.
- **Actual:** Three different stories are presented: disconnected payments, Stripe, and Whop.
- **Evidence:** Live production HTML; `converter-express_1.html:1846-1848`, `:1870-1872`, and `:2626`; Whop server paths in `supabase/functions/crm-api/index.ts:70-107`.
- **Suggested fix:** Update both policies and checkout disclosure together; include Whop's role, data sharing, accepted methods, refund handling, and effective date.

### BUG-003 — High — Order CSV reports every payment method as Card

- **Page/module:** Admin → Orders → Download CSV
- **Description:** The export ignores the order's recorded `paymentMethod` and writes the literal `Card` for every row.
- **Steps to reproduce:** Record a synthetic invoice as Cash or Check; download orders CSV; inspect Payment Method.
- **Expected:** Exported method equals the saved method, or is blank when not recorded.
- **Actual:** Payment Method is `Card` for all orders.
- **Evidence:** `converter-express_1.html:3422-3452`, specifically line 3440.
- **Suggested fix:** Export `o.paymentMethod || ''`; add regression cases for cash, check, Whop, partial, unpaid, and historical blanks.

### BUG-004 — High — A paid order can be cancelled without a refund/reconciliation workflow

- **Page/module:** Admin order detail/list
- **Description:** Cancellation only sets `cancelled = true`. It does not block paid invoices, create a credit/refund state, call Whop, capture a reason, or reconcile inventory/accounting.
- **Steps to reproduce:** With synthetic data, open a paid order and invoke Cancel; observe the cancelled flag while payment history remains paid and no refund action exists.
- **Expected:** Paid/partially paid orders require an explicit refund, credit, or “cancel without refund” reconciliation with reason and audit trail.
- **Actual:** The order becomes cancelled through a one-line state mutation.
- **Evidence:** `converter-express_1.html:1213-1218`; cancellation controls are rendered for non-cancelled orders around `:2559` and `:3707`.
- **Suggested fix:** Separate order cancellation, fulfillment reversal, invoice void, credit memo, and processor refund. Require permission, reason, preview, confirmation, and immutable history.

### BUG-005 — Medium — Quote status can falsely imply delivery to the customer

- **Page/module:** Admin → Quotes
- **Description:** Staff can select “Sent,” but the product does not send the quote or store delivery evidence.
- **Steps to reproduce:** Create a quote and select Sent.
- **Expected:** “Send quote” delivers through a configured channel and records recipient, provider ID, timestamp, and delivery state; otherwise label it “Marked as sent externally.”
- **Actual:** Only the status changes.
- **Evidence:** `supabase-app/crm.js:39` and `:44`; the UI itself notes that Sent records an offline action.
- **Suggested fix:** Implement secure customer quote links and Resend/SMS delivery, or rename the status/action so it cannot be mistaken for delivery.

### BUG-006 — Medium — Production bundle contains obsolete “Local preview” customer/admin copy

- **Page/module:** Shop dashboard and fallback login implementations
- **Description:** Production HTML contains text saying details are saved on this computer and secure authentication is not connected.
- **Steps to reproduce:** Inspect production HTML or execute a path that reaches the legacy fallback implementation.
- **Expected:** Production assets contain only production-accurate messaging.
- **Actual:** “Local preview” and “authentication is not connected” copy ships in the live bundle.
- **Evidence:** Live HTML search; `converter-express_1.html:2178`, `:2190`, and `:2653`. `auth.js` overrides normal hosted auth paths, reducing ordinary exposure but not removing the misleading fallback code.
- **Suggested fix:** Remove preview implementations from the production artifact and keep fixtures in test-only files.

### BUG-007 — Medium — Failed payment setup can strand an invoice in an unrecoverable checkout state

- **Page/module:** Whop checkout setup
- **Description:** The server first commits a `paymentCheckout` reservation, then calls Whop. If the external call fails before the checkout becomes ready, later attempts see an existing checkout and tell the user to contact support. There is no timeout/clear command in the UI.
- **Steps to reproduce:** In a synthetic integration environment, make Whop fail after `payment-checkout-reserve`; retry the invoice checkout.
- **Expected:** A failed/expired reservation can be safely retried with the same idempotency key or cleared by authorized reconciliation.
- **Actual:** An existing `creating` checkout blocks a new attempt.
- **Evidence:** `supabase/functions/crm-api/index.ts:77-83`; the Payment Element path similarly reserves at `:92-96`.
- **Suggested fix:** Persist explicit failure/expiry states, reuse the reservation idempotently, and add a staff reconciliation action that never discards confirmed payment history.

## 4. Missing Features

These are product gaps, not claims that existing code is broken.

| Priority | Missing feature | Shop-owner problem and scenario | Proposed behavior | Business value | Effort |
|---|---|---|---|---|---|
| P0 | Refund, void, credit memo, dispute workflow | A paid order is cancelled, returned, duplicated, or disputed; today the owner must reconcile Whop and the portal manually. | Processor-backed full/partial refunds, credit memos, reasons, approvals, inventory disposition, customer notice, immutable history. | Prevents money/accounting errors and support disputes. | High |
| P0 | Accurate legal and commerce policies | Customers cannot confidently accept draft/contradictory terms. | Counsel-approved policies tied to Whop, shipping, returns, warranty, privacy, and wholesale eligibility. | Reduces legal and trust risk. | Medium/non-code |
| P1 | Staff users, roles, and permissions | Drivers, warehouse staff, sales, and accounting should not all have owner access. | Named users with least-privilege roles, activation/deactivation, optional MFA, action attribution. | Enables safe delegation and growth. | High |
| P1 | Customer quote delivery and approval | Sales must leave the system to send a quote and manually mark acceptance. | Branded link/email/SMS, approve/decline, signature/name, expiry, revision, conversion. | Faster conversion, better evidence. | Medium-high |
| P1 | Return merchandise and replacement workflow | Resolving a warranty note does not move the physical part or financial balance. | RMA, eligibility, label/tracking, received inspection, replacement/credit/refund, core handling. | Prevents lost returns and inconsistent promises. | High |
| P1 | Reliable payment recovery/reconciliation | A failed setup or unmatched webhook requires developer intervention. | Expiring reservations, retry, event/review queue, webhook health, safe manual reconciliation. | Protects cash flow and reduces support. | Medium-high |
| P1 | Complete data export and restore | The owner can export only orders, and even that export is flawed. | Accounts, catalog, stock, purchases, quotes, requests, invoices, payments, activity; scheduled backups and tested restore. | Business continuity and portability. | Medium |
| P1 | Supplier/vendor ordering integration | POs are recorded but sent separately; ETA and cost updates are manual. | Vendor records, send PO, acknowledgements, backorders, receiving, bill/cost variance. | Saves time and improves stock accuracy. | High |
| P2 | Customer communication center | Delivery changes, approvals, reminders, and return updates require outside tools. | Template-based email/SMS, preferences, delivery state, thread/history, opt-out controls. | Fewer calls, faster approvals, retention. | High |
| P2 | Accounts receivable controls | There is no aging report, statements, collection notes, write-offs, or batch receipt. | Aging buckets, statements, reminders, payment allocation, write-offs, batch payments. | Improves collections and bookkeeping. | Medium-high |
| P2 | Inventory depth | One global count cannot represent LA/local stock, bins, damaged units, transfers, cycle counts, or landed cost. | Multi-location/bin stock ledger, adjustments with reason, counts, transfers, valuation, reorder suggestions. | Fewer stockouts and errors. | High |
| P2 | Accounting integration | Owners must re-enter sales, fees, refunds, tax, and costs. | QuickBooks/Xero mapping and reconciliation export/API. | Saves bookkeeping time and reduces errors. | High |
| P2 | Operational reporting | Current metrics do not show fill rate, delivery SLA, stock turns, aging, conversion, returns, or customer cohorts. | Filterable reports with drill-down and export. | Better purchasing, service, and margin decisions. | Medium-high |
| P3 | Route optimization and driver proof | Dispatch uses free-text driver and sequence only. | Driver accounts, route map, ETA, proof of delivery photo/signature, failed-delivery reasons. | Scales same-day service. | High |
| P3 | Native barcode/mobile warehouse tools | Receiving and counts are keyboard-driven. | Scan part/PO/bin, receive/count/pick on mobile. | Faster, more accurate warehouse work. | High |

### Deliberately out of scope unless the product strategy changes

Appointments, technician boards, labor guides, digital vehicle inspections, work orders, time clocks, and payroll are essential to a **shop management system**, but Converter Express currently behaves as a **parts supplier portal**. Building those features would change the product category. Do not add them merely to match competitors unless the business intends to sell shop-management software.

## 5. UX/UI Problems

| Impact | Friction | Why it matters | Improvement |
|---|---|---|---|
| High | No guided owner onboarding after first admin sign-in | A new owner must discover settings, catalog pricing, stock counts, email/payment readiness, staff access, and delivery rules independently. | Add a launch checklist with verified status and direct links; hide it after completion. |
| High | Admin navigation exposes roughly a dozen equal-weight sections | A busy owner sees product architecture rather than today's priorities. | Use a stable sidebar or compact grouped navigation; keep Overview, Orders, Inventory, Invoices, Accounts primary and move configuration under Settings. |
| High | Destructive and financial actions lack a unified confirmation/reconciliation pattern | Cancel, reinstate, delete, close invoice, receive stock, and resolve warranty have different safeguards. | Standardize confirmation dialogs with impact preview, reason, affected stock/payment, and final state. |
| High | Save failures use a small global status and then block further work on conflict | An owner can miss that a change failed, especially in a long page. | Show a persistent error banner near the edited record, retain the draft, offer reload/compare, and prevent navigating away with a clear explanation. |
| Medium | Quote, purchase, dispatch, and warranty statuses rely on manual interpretation | Labels can imply external work happened when only an internal state changed. | Use action-oriented states: Draft, Marked sent externally, Provider accepted, Delivered, Awaiting customer, etc. |
| Medium | Task owner and dispatch driver are free text | Spelling differences fragment reporting and do not enforce responsibility. | Select active staff users; retain a controlled “external driver” option. |
| Medium | Search/filter state is inconsistent across modules | Invoices are strong; other screens lack comparable search, saved views, counts, and URL state. | Apply one table/list pattern with search, filters, sort, result count, empty state, and downloadable view. |
| Medium | Settings expose tax and profit assumptions without operational guidance | A non-technical owner can enter values but may not understand their effect or jurisdiction limits. | Add inline examples, effective dates, and a test-calculation preview; flag that tax advice is not provided. |
| Medium | Contact and photo-request actions depend on `mailto:` | Browser/device mail configuration may do nothing, with no confirmation or retained case. | Add a server-backed inquiry form tied to account/part/order, with success state and staff queue. |
| Medium | Mobile testing proves no overflow, but admin density remains high | “Fits” is not the same as being efficient on a phone; long navigation and data-heavy cards require substantial scrolling. | Provide mobile bottom navigation for top tasks, collapsible filters, sticky primary actions, and abbreviated tables/cards. |
| Low | Unknown routes silently return home | Mistyped/deep links look like a successful navigation and obscure broken links. | Render a 404 page with route-safe recovery links. |

## 6. Broken or Incomplete Workflows

### Paid order cancellation or partial refund

**Cannot be completed safely end to end.** The admin can cancel an order, but cannot refund Whop, create a credit memo, allocate a partial refund, explain the reason, reverse/retain inventory intentionally, or notify the customer. This should block launch until paid cancellations are reconciled.

### Quote creation to customer approval

**Incomplete.** Staff can create a quote, manually choose Sent/Accepted, and convert it. The system does not send the quote, provide a customer view, collect approval/signature, or prove what version was accepted.

### Purchase order to supplier

**Incomplete by design.** Staff can record and receive a PO, but the UI explicitly says to send it to the supplier separately. There is no vendor contact, acknowledgement, backorder, cost variance, or supplier document.

### Return/warranty request to physical and financial resolution

**Incomplete.** Customer intake and staff response work. The platform cannot issue an RMA/label, record receipt and inspection, ship a replacement, credit/refund the invoice, or link the outcome to inventory.

### Payment failure recovery

**Incomplete.** Defensive payment verification exists, but a checkout reservation can remain stuck after an upstream failure. There is no owner-facing payment event log, retry/expiry action, dispute queue, or refund path.

### Multiple employees editing concurrently

**Safe from silent overwrite, poor recovery.** The JSON workspace revision check rejects stale saves with “Reload and try again.” That protects data, but the second employee loses the ability to merge their draft. All staff are also administrators, so there is no least-privilege model.

### Internet disconnect while saving

**Partially handled.** The interface reports the save failure, keeps the tab dirty, retries on its interval, and warns before unload. There is no offline queue, record-level draft, or robust merge after another staff member saves first.

### Invoice correction

**Limited.** Payment amount/method/reference and due date can be recorded, and a fully paid invoice can close. There is no item-level post-issue adjustment, void/reissue, credit memo, tax correction trail, or locked finalized invoice version.

### Staff access lifecycle

**Operationally incomplete.** Staff authorization is a private table entry managed outside the app. There is no owner UI for inviting, disabling, role assignment, access review, or security events.

### Full business backup/restore

**Unavailable to the owner.** Orders CSV is the only visible export. Database backup guidance exists in the README, but no owner-accessible backup, restore test, or storage-file retention workflow is implemented.

## 7. Business Owner Experience

### First day

The public site explains the wholesale model well and makes part search prominent. A shop owner can register, verify email, upload a permit, and understand that approval is required. The friction begins after submission: there is no visible service-level timer beyond “usually within one business day,” no guided setup for the owner/admin, and no readiness view for catalog prices, stock, payment, email, delivery, and legal settings.

The owner can begin loading parts and stock manually, approve accounts, and create phone orders. This is workable for a small catalog and one trusted operator, but the amount of manual data entry is high. There is no bulk catalog import in the normal UI, vendor synchronization, or location-aware stock.

### First week

Daily order, invoice, inventory, dispatch, and customer-account work is mostly coherent. The Overview action queue and refined invoice desk are helpful. Search and filtering vary by module, and the owner will continue using email/phone for quotes, supplier POs, delivery updates, and many customer questions. They will also need a separate accounting system and must manually reconcile refunds and exceptions.

### After three months

The single-workspace architecture and all-admin staff model become the main constraints. More staff means more revision conflicts and greater access risk. More data means slower full-document reads/writes, harder reporting, and an eventual 9 MB application-level ceiling (`business.mjs:28`). The owner cannot obtain a full self-service export or detailed change history. Manual part/vendor/driver names make reporting inconsistent.

### Would I pay for it?

As a local repair shop buying converters regularly, I would use the customer portal if Converter Express's availability, pricing, fitment support, and delivery reliability were strong. The software supports that supplier relationship. As the owner of Converter Express, I would pay for the internal tool only after refunds, legal copy, staff permissions, quote delivery, backups, and payment recovery are addressed. I would not replace a full shop-management platform with it.

### Likely cancellation triggers

- A paid cancellation or return creates two conflicting financial records.
- Staff overwrite or cannot recover work after a revision conflict.
- Quotes, supplier POs, and delivery communications still require multiple outside tools.
- The owner cannot give employees limited access.
- Inventory or financial exports cannot be trusted or reconciled.

### Reasons customers may recommend it

- Fast wholesale part search with vehicle/test-group context.
- In-stock compatible parts are prioritized without exposing quantities to guests.
- Negotiated shop pricing, saved parts, quick reorder, and PO/job references.
- Clear delivery status and a simple invoice-payment path.
- A direct return/warranty request tied to the original order.

## 8. Competitive Gaps

Converter Express is best compared with supplier portals for product strategy, but established shop-management products illustrate what users may assume “shop software” includes. The statements below are from official vendor pages checked during this audit, not independent performance validation.

### Verified competitor capabilities

- **Tekmetric** publicly lists digital vehicle inspections, estimate building, parts/inventory management, real-time reporting, integrated payments, digital invoicing, text-to-pay, online booking, reminders, role-based permissions, employee/time-clock tools, and 50+ integrations. Sources: [Tekmetric shop management](https://www.tekmetric.com/feature/shop-management), [Tekmetric homepage](https://www.tekmetric.com/), and [Tekmetric pricing](https://www.tekmetric.com/pricing).
- **Shopmonkey** publicly presents appointments/reminders, digital inspections, estimates and invoices sent by email/text, integrated payments, accounting/QuickBooks, customer communication, parts ordering, technician/job management, and reporting. Sources: [Shopmonkey](https://www.shopmonkey.io/) and its [mobile mechanics workflow](https://www.shopmonkey.io/demo-mobile-mechanics).
- **Shop-Ware** describes fleet customer profiles, fleet accounts-receivable reporting, PO numbers, batch payments, customizable labor rates, multi-location management, customer history, and analytics. Source: [Shop-Ware fleet workflow PDF](https://shop-ware.com/wp-content/uploads/Shop-Ware-eBook-Fleet-Work-Without-The-Chaos-2025.pdf).

### Implications for this product

The gap is large if Converter Express is positioned as full shop management: it lacks scheduling, repair orders, technicians, inspections, labor, approvals, integrated communication, accounting, and deep reporting. The gap is much smaller if it is positioned accurately as Converter Express's wholesale purchasing and account portal. In that category, the most important missing depth is refunds/credits, quote approval, returns logistics, vendor purchasing, communication, multi-user permissions, and reliable exports.

### Assumptions requiring market validation

- Shops may prefer a focused supplier portal over another full shop-management subscription.
- Whop may meet customers' accepted-payment and reconciliation expectations.
- Same-day local delivery and 1–2-business-day LA fulfillment may be more valuable than broad workflow functionality.
- Manual catalog maintenance may be acceptable at the current SKU/change volume.

Interview 5–10 active customer shops before expanding into appointments or technician management. Test which supplier-specific tasks they repeat weekly, which systems they already use, and which integrations would remove duplicate entry.

## 9. Prioritized Improvement Roadmap

### P0 — Must Fix Before Launch

1. Replace draft Terms and Privacy with approved, factually accurate policies.
2. Build a safe paid cancellation/refund/credit workflow or block cancellation of paid/partial invoices until staff reconcile it through a documented process.
3. Fix CSV payment-method accuracy and validate exports against representative invoices.
4. Add recovery for failed/expired Whop checkout reservations and an owner-visible reconciliation queue.
5. Remove preview-only code/copy from production and complete a production acceptance run with disposable accounts: register, verify, approve, order, email, payment sandbox/test mechanism if Whop provides one, webhook, delivery, request, and recovery.
6. Confirm backup/restore and Storage retention in production; record an owner-accessible recovery runbook.

### P1 — High Priority

1. Add named staff users, roles, deactivation, and optional/required MFA for owner and finance functions.
2. Send quotes through secure customer links with approval/decline and version evidence.
3. Expand returns/warranty into RMA, receipt, replacement, credit, and refund outcomes.
4. Provide full business export and detailed, record-level audit history.
5. Standardize save/conflict/error UX with draft preservation and clear recovery.
6. Add an admin onboarding/readiness checklist.
7. Add payment/webhook/email/fitment operational health and alerting.

### P2 — Product Improvements

1. Vendor records, supplier PO delivery/acknowledgement, cost variance, and backorders.
2. Accounts-receivable aging, statements, reminders, write-offs, and batch payments.
3. Multi-location/bin inventory ledger, cycle counts, transfers, and valuation.
4. QuickBooks/Xero integration or accountant-ready journal exports.
5. Customer communication center for quote, order, delivery, invoice, and return updates.
6. Operational reports: fill rate, delivery SLA, stock turns, quote conversion, margins, aging, returns, and customer retention.
7. Bulk catalog/fitment import with validation, preview, error report, and rollback.

### P3 — Future Enhancements

1. Driver mobile view, routing, ETA, proof of delivery, and failed-delivery reasons.
2. Barcode receiving, picking, counting, and bin management.
3. Multiple branches/warehouses and inter-location transfers.
4. Customer purchasing controls such as buyers, spending limits, approval chains, and consolidated statements.
5. Only after market validation: deeper shop-management features or integrations with the systems shops already use.

## 10. Final Verdict

### Is this software ready for paying customers?

**Not for unsupervised general launch.** It is close to a useful small-team wholesale supplier portal, and its core security/ordering rules are promising. Fix the P0 legal, financial, export, payment-recovery, and production-acceptance issues first. It is not a complete shop-management product and should not be sold as one.

### Five biggest problems

1. Live legal pages are drafts and contradict the active payment processor.
2. Paid cancellations, refunds, credits, and disputes cannot be reconciled end to end.
3. All staff are effectively administrators; safe delegation is impossible.
4. Quote, supplier PO, returns logistics, and many communications leave the system.
5. One large JSON workspace limits concurrency, reporting, detailed audit, and long-term scale.

### Five most valuable missing features

1. Refund/credit/cancellation reconciliation.
2. Role-based staff management.
3. Customer quote delivery and digital approval.
4. Complete RMA/replacement/credit workflow.
5. Full export, backup/restore, and accounting reconciliation.

### What should be fixed first?

Publish accurate legal/payment terms and prevent paid orders from being cancelled without an explicit financial outcome. Those two items expose the business immediately even at low volume.

### What would prevent a shop owner from adopting it?

Unclear legal/payment trust, incomplete exception handling, reliance on external email/accounting/vendor tools, no restricted employee access, and uncertainty that records can be exported or recovered.

### What would make it genuinely worth paying for?

A dependable wholesale-parts workflow that saves repeated work: accurate compatible-part availability, shop-specific pricing, fast reorder, accountable quotes, reliable local/LA delivery, self-service payment, transparent status, clean returns, and integrations that prevent the shop from entering the same order into multiple systems. The product does not need every feature of Tekmetric or Shopmonkey; it needs the supplier relationship to be exceptionally complete and trustworthy.

---

## Appendix A — Automated verification run

The following passed during this audit:

- **7 unit test files / 63 tests:** customer payment and warranty updates; protected manual deletion; product deletion; email generation/delivery-state logic; data projection, pricing, stock, idempotency and authorization; stock-first fitment; Whop signature/payment integrity.
- **20 Chrome browser files:** About page; account review; branded auth; disconnected fail-closed state; connected sign-in/cart/order; customer updates; manual deletion; product deletion; invoice desk; mobile featured cards; mobile fitment; mobile footer; mobile hero; mobile series; offer card; order email preview/send state; profit overview; public outage; stock-first fitment; Whop Payment Elements.

Passing tests demonstrate the stated synthetic scenarios. They do not prove real email delivery, external fitment uptime, live payment settlement/refund, production backup recovery, or authenticated production data behavior.

## Appendix B — Key implementation references

- Router and page inventory: `supabase-app/converter-express_1.html:1328-1371`
- Draft/stale legal pages: `supabase-app/converter-express_1.html:1837-1878`
- Cancellation mutation: `supabase-app/converter-express_1.html:1213-1222`
- CSV export: `supabase-app/converter-express_1.html:3421-3468`
- Registration/license flow: `supabase-app/auth.js:43-47`
- Optimistic admin save/conflict: `supabase-app/auth.js:49`
- Customer/admin projections and validation: `supabase-app/supabase/functions/_shared/business.mjs:16-40`
- Payment recording and warranty resolution: `supabase-app/supabase/functions/_shared/business.mjs:92-104`
- Whop payment setup: `supabase-app/supabase/functions/crm-api/index.ts:70-107`
- Admin save and retry rules: `supabase-app/supabase/functions/crm-api/index.ts:109-130`
- Whop webhook verification/application: `supabase-app/supabase/functions/whop-webhook/index.ts:1-10`
- Private workspace/staff/audit/storage schema: `supabase-app/supabase/migrations/202610050001_private_workspace.sql:1-62`
- Quote and purchasing limitations: `supabase-app/crm.js:39-53`
