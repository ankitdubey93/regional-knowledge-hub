# Invoice content and rounding (B2)

Written 2026-11-03 (B2 Step 4). "Checked on" is a date only for a row read on the cited page that day; otherwise it says not checked. The ATO pages answered HTTP 403 to the fetch tool, so every AU row is not checked. The adjacent source for the rounding row in AU is the ATO GST and rounding page (HTTP 403); no search fallback was used because the URL did not return 404.

## UK (VAT Notice 700, https://www.gov.uk/guidance/vat-guide-notice-700)

| Requirement | How B2 meets it | Source | Checked on |
|---|---|---|---|
| Sequential unique number (§16.3.1) | `invoice_counter`, gapless `INV-0001` numbers assigned at issue | https://www.gov.uk/guidance/vat-guide-notice-700 §16.3.1 | 2026-11-03 |
| Time of supply (tax point) (§16.3.1) | B2 uses the issue date | https://www.gov.uk/guidance/vat-guide-notice-700 §16.3.1 | 2026-11-03 |
| Invoice date (§16.3.1, where different to time of supply) | `issued_on` | https://www.gov.uk/guidance/vat-guide-notice-700 §16.3.1 | 2026-11-03 |
| Supplier name and address (§16.3.1) | Firm's legal name and address from billing settings; issue refuses without them | https://www.gov.uk/guidance/vat-guide-notice-700 §16.3.1 | 2026-11-03 |
| Supplier VAT registration number (§16.3.1) | `seller_tax_number` from billing settings | https://www.gov.uk/guidance/vat-guide-notice-700 §16.3.1 | 2026-11-03 |
| Customer name and address (§16.3.1) | Entity name and `buyer_address`; issue refuses without the address | https://www.gov.uk/guidance/vat-guide-notice-700 §16.3.1 | 2026-11-03 |
| Description sufficient to identify the supply (§16.3.1) | Line description | https://www.gov.uk/guidance/vat-guide-notice-700 §16.3.1 | 2026-11-03 |
| Quantity and unit price excluding VAT (§16.3.1, §16.3.2) | Time lines show minutes and rate; fixed lines show one amount. Quantity read; the page does not say in so many words that the unit price is stated excluding VAT | https://www.gov.uk/guidance/vat-guide-notice-700 §16.3.1, §16.3.2 | not checked (unit price excluding VAT not stated on the page) |
| VAT rate per line (§16.3.1) | Treatment label and rate per line | https://www.gov.uk/guidance/vat-guide-notice-700 §16.3.1 | 2026-11-03 |
| Total excluding VAT (§16.3.1) | `subtotal_cents` | https://www.gov.uk/guidance/vat-guide-notice-700 §16.3.1 | 2026-11-03 |
| Total VAT in sterling (§16.3.1) | `tax_cents`; for a non-sterling invoice the FX block shows `tax_home_cents` | https://www.gov.uk/guidance/vat-guide-notice-700 §16.3.1 | 2026-11-03 |
| Zero-rated or exempt items show no VAT payable, with a separate total (§16.5) | Treatment label per line and `noTaxSubtotalCents` | https://www.gov.uk/guidance/vat-guide-notice-700 §16.5 | 2026-11-03 |
| Rounding (§17.5.1) | VAT per line to the nearest 1p (`roundDiv`, half away from zero), applied to every line, then summed. §17.5.1 allows per-line rounding if used consistently | https://www.gov.uk/guidance/vat-guide-notice-700 §17.5, §17.5.1 | 2026-11-03 |

## AU (ATO tax invoices)

| Requirement | How B2 meets it | Source | Checked on |
|---|---|---|---|
| States that it is a tax invoice | Document title "Tax invoice" when the scheme is `au_gst` | https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices | not checked (HTTP 403) |
| Seller identity and ABN | Firm's legal name and ABN from billing settings | https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices | not checked (HTTP 403) |
| Date of issue | `issued_on` | https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices | not checked (HTTP 403) |
| Description, quantity and price | Line description, minutes and rate or one amount | https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices | not checked (HTTP 403) |
| GST amount | `tax_cents` and per-line tax | https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices | not checked (HTTP 403) |
| Extent to which each item is taxable | The line's treatment label (GST, GST-free, Not a taxable supply) | https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices | not checked (HTTP 403) |
| Buyer identity at or above {{fact:au.gst.taxInvoiceBuyerIdThreshold}} | B2 always shows the buyer's name | https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices | not checked (HTTP 403) |
| Rounding | GST per line to the nearest cent (`roundDiv`, half away from zero), then summed | https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/your-industry/financial-services-and-insurance/gst-and-rounding | not checked (HTTP 403) |

## Not covered

- Credit notes
- Recipient-created tax invoices
- Simplified or retail invoices
- Reverse charge invoices
- A tax point earlier than the issue date
