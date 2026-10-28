# Plan (outline): A2 extraction to draft journals

Date: 2026-10-28
Status: outline

> **OUTLINE: not dispatchable.** This plan names its tables, routes, decisions and step skeleton, but its starting state depends on plans that have not landed. When every plan in **Gate** is done, run `/code-planner` on this file. That rewrites it as a full plan: verified starting state, word-for-word contracts, proofs, and the Dispatch block and manifest. Until then, `plan-execute` must refuse it.

**Outcome:** from an uploaded invoice or receipt with a text layer, the assistant proposes the vendor, date, currency, total and tax. The engines build a draft journal, and an accountant reviews and approves it. Approved journals export as CSV. A figure the model proposes that is not in the document text is never used.

## Gate

- P4 (built): `extractFile`, sealed documents and `redactWith`.
- The **Stage 3 launch gate** (NER decision).
- D2, if posting into a GL is wanted. Without D2, journals export only.
- **Owner checkpoint:** the GST and VAT coding rules used for the tax split (`tax-codes.json`, `verifiedOn: null` today) are checked in L2 first.

## Decisions (approved 2026-10-28)

- **Text layer only.** A document with no extractable text shows "Can't read this file: it has no text layer." No OCR, and no image sent to a provider (Hard rule 13).
- **The provider returns JSON matching a zod schema:** `{ vendor, invoiceDate, currency, totalText, taxText, lines?: [...] }`. Amounts come back **as the strings found in the document**.
- **Verbatim check.** Each string must appear in the document's extracted text after whitespace normalisation, or the field is set to null and flagged `not_in_document`. Amounts are then parsed with `parseMoney`. The model's arithmetic is never used.
- **Tax split.** The engines (`gst.ts`/`vat.ts` patterns) compute the split from the total and the chosen tax code. If the document states a tax figure that differs from the engine's, both are shown and the difference is flagged.
- **Account suggestion** comes from the entity's imported accounts (`ledger_account`) by a name match. No model is involved; the accountant chooses.
- **Tenant table** `draft_journal`, with status `proposed`, `approved` or `rejected`, plus its lines.
- **Spend guard.** Each extraction is one `ai_usage` row.

## Name registry

| Kind | Name |
|---|---|
| Tables | `draft_journal (id, org_id, client_id, document_id, status, vendor_text, invoice_date date null, currency, total_cents null, tax_cents null, flags text[], approved_by null, approved_at null, created_at)`; `draft_journal_line (id, org_id, journal_id, account_code, debit_cents, credit_cents, tax_code null)` |
| Modules | `server/src/extract/extractInvoice.ts` (prompt, schema, verbatim check); `shared/src/utils/journalDraft.ts` (lines from total, tax code and accounts) |
| Routes | `POST /api/clients/:clientId/documents/:docId/extract`; `/api/clients/:clientId/journals` (GET, PATCH approve or reject, CSV export) |
| Page | `/entities/:id/journals`, plus an "Extract" action on the Documents page |

## Step skeleton

1. [Sonnet] Re-verify. Check the L2 status of `tax-codes.json`.
2. [Sonnet] `journalDraft.ts` and its tests: balanced lines, integer cents, the tax split through the engines.
3. [Sonnet] `extractInvoice.ts`: prompt, schema and the verbatim check. Unit tests with fixture texts, including a hallucinated total that must be dropped.
4. [Sonnet] Migrations and RLS.
5. [Sonnet] Service and routes, with the stub provider in tests, cross-tenant tests and the spend guard.
6. [Haiku] Journals page and the Extract button.
7. [Haiku] Component tests.
8. [Sonnet] e2e.
9. [Sonnet] Guardrail review (rules 3, 4, 12, 13, 15).
10. [Sonnet] Docs sync.

## Risks

- **Foreign-currency receipts** (the research's foreign inward remittance) are outside AUD and GBP. They show "currency not supported" until a multi-currency ledger exists.
