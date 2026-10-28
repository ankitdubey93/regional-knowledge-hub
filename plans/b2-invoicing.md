# Plan (outline): B2 pricing and invoicing

Date: 2026-10-28
Status: outline

> **OUTLINE: not dispatchable.** This plan names its tables, routes, decisions and step skeleton, but its starting state depends on plans that have not landed. When every plan in **Gate** is done, run `/code-planner` on this file. That rewrites it as a full plan: verified starting state, word-for-word contracts, proofs, and the Dispatch block and manifest. Until then, `plan-execute` must refuse it.

**Outcome:** a firm sets each entity's pricing (hourly rates, a fixed fee per engagement, or a monthly retainer). It generates draft invoices from unbilled time and fees, issues them with sequential numbers and GST or VAT on its fees, and prints them or exports them as CSV.

## Gate

- `b1-time`.
- **Owner checkpoints before release:**
  1. `fact-check` the required content of an AU tax invoice and a UK VAT invoice (ATO and HMRC pages).
  2. The owner confirms the FX policy (manual rate on the invoice).

## Decisions (approved 2026-10-28)

- **Engine:** `shared/src/utils/invoice.ts`.
  - Integer cents; every rounding through `roundDiv` (Hard rule 3).
  - Hourly line: `roundDiv(minutes * rateCentsPerHour, 60)`.
  - Tax per line, then summed. **Per line or per invoice: confirm against the ATO and HMRC rounding guidance when expanding.** The rate comes from `kb_fact` (`au.gst.rate`, `uk.vat.standardRate`, or whatever key exists; verify).
- **Currency.** An invoice is in the entity's currency (`AUD`/`GBP`). Rate cards are per currency.
- **Cross-currency** happens only when the firm's rate card currency differs. Then the invoice stores `fx_rate_micros` (integer, rate × 10⁶), `fx_rate_date` and `fx_rate_source` as entered by the user. No feed.
- **Numbering.** Per-firm sequence `invoice_counter (org_id pk, next int)`, incremented in the issuing transaction (`SELECT … FOR UPDATE`). Drafts have no number. An issued invoice is immutable; corrections are credit notes (a later slice, listed as not built).
- **Output.** A print stylesheet on `/invoices/:id/print` (no PDF dependency) and a CSV for Xero and QBO import. **Check the column names against the Xero and QBO import templates** (same session as the L2 demo exports).
- **Firm details on the invoice** (ABN or VAT number, address) are new organization columns.

## Name registry

| Kind | Name |
|---|---|
| Tables | `rate_card (id, org_id, user_id null, currency, cents_per_hour int)`; `client_pricing (client_id, org_id, model text check in ('hourly','fixed','retainer'), fixed_cents int null, retainer_cents int null, currency)`; `invoice (id, org_id, client_id, number int null, status check in ('draft','issued','void'), issued_on date null, due_on date null, currency, subtotal_cents, tax_cents, total_cents, fx_rate_micros bigint null, fx_rate_date date null, fx_rate_source text null, tax_fact_key text, tax_rate_bp int)`; `invoice_line (id, org_id, invoice_id, kind, description, quantity_minutes int null, unit_cents int, amount_cents, tax_cents)`; `invoice_counter` |
| Engine | `invoice.ts` → `linesFromTime`, `invoiceTotals`, `convertCents(amountCents, fxRateMicros)` |
| Routes | `/api/clients/:clientId/pricing`; `/api/invoices` (GET, POST draft); `/api/invoices/:id` (GET, PATCH draft); `/api/invoices/:id/issue`; `/api/invoices/:id/void`; `/api/invoices/:id.csv` |
| Pages | `/invoices`, `/invoices/:id`, `/invoices/:id/print`, pricing on entity settings, rate cards on `/workspace/members` |

## Step skeleton

1. [Sonnet] Re-verify.
2. [Sonnet] `fact-check` the invoice content requirements, plus the GST and VAT fact keys. Unconfirmed items are shown as "not checked" on the invoice page.
3. [Sonnet] `invoice.ts` and its tests: published worked examples where they exist, rounding edge cases, FX.
4. [Sonnet] Migrations, RLS, the counter.
5. [Sonnet] Services: draft from unbilled time (locks the entries), issue (number, immutable), void.
6. [Sonnet] Tests: cross-tenant; numbers are gapless and unique under concurrency; issued is immutable; time is locked.
7. [Haiku] Pages and print CSS.
8. [Haiku] Component tests.
9. [Sonnet] e2e, including the print page at 375 and 1440 px.
10. [Sonnet] Guardrail review.
11. [Sonnet] Docs sync.

## Risks

- **Invoices are tax documents**, so a wrong required field is the project's worst bug in a new place. Step 2 is not optional.
