---
title: GST and the BAS
summary: How Australian GST works, taxable vs GST-free vs input-taxed, tax invoices, registration, and how each BAS label is filled.
jurisdiction: AU
level: beginner
order: 1
facts: [au.gst.rate, au.gst.registrationThreshold, au.gst.registrationThresholdNfp, au.gst.taxInvoiceThreshold, au.gst.taxInvoiceBuyerIdThreshold, au.gst.cashBasisTurnoverLimit, au.gst.simplerBasTurnoverLimit, au.gst.monthlyReportingThreshold, au.bas.quarterlyDueDates]
tools: [tax, coding, journal]
---

**Goods and Services Tax (GST)** is a broad tax of {{fact:au.gst.rate}} on most goods and services sold in Australia. A registered business collects GST on its sales, claims back the GST it paid on its business purchases (**GST credits**), and pays the difference to the **Australian Taxation Office (ATO)** on its **Business Activity Statement (BAS)**.

## Working out GST

| You have | GST is | Example at {{fact:au.gst.rate}} |
|---|---|---|
| A GST-exclusive price | price × 10% | 1,000 → GST 100, total 1,100 |
| A GST-inclusive price | price ÷ 11 | 1,100 → GST 100 |

The "divide by 11" rule only works because the rate is {{fact:au.gst.rate}}: GST is 10/110 of the inclusive price.

## Three kinds of sale

| Type | GST charged? | GST credits on related purchases? | Examples |
|---|---|---|---|
| **Taxable** | Yes | Yes | Most goods and services |
| **GST-free** | No | Yes | Most basic food, some health, education and childcare, exports |
| **Input-taxed** | No | **No** | Financial supplies (interest, loans), residential rent, sales of existing residential premises |

The difference between GST-free and input-taxed matters: a GST-free business still claims credits on its costs; an input-taxed one cannot.

Some things are outside GST altogether and are **BAS excluded**: wages, super, PAYG withheld, loan principal, transfers between your own accounts, owner contributions and drawings, dividends, income tax.

## Registration

You must register for GST within 21 days once your **GST turnover** (current or projected) reaches {{fact:au.gst.registrationThreshold}} ({{fact:au.gst.registrationThresholdNfp}} for non-profits). Taxi and ride-share drivers must register regardless of turnover. Below the threshold, registration is optional.

An unregistered supplier does not charge GST, and its invoices carry no GST you can claim.

## Tax invoices

To claim a GST credit on a purchase over {{fact:au.gst.taxInvoiceThreshold}} (GST-inclusive), you need a **tax invoice**. A supplier must give one within 28 days of being asked. A tax invoice shows:

- that it is a tax invoice;
- the seller's identity and **ABN**;
- the date;
- what was sold, with quantity and price;
- the GST amount (or a statement that the total includes GST, where GST is exactly 1/11);
- the extent to which each item is taxable;
- for sales of {{fact:au.gst.taxInvoiceBuyerIdThreshold}} or more, the buyer's identity or ABN.

## Cash or accruals for GST

- **Accruals (non-cash) basis**: report GST in the period the invoice is issued or received, paid or not.
- **Cash basis**: report GST in the period the money is received or paid. Allowed for businesses with aggregated turnover under {{fact:au.gst.cashBasisTurnoverLimit}}.

This is a GST setting. The financial statements can still be on accruals.

## How often

- Monthly reporting is required at a GST turnover of {{fact:au.gst.monthlyReportingThreshold}} or more.
- Below that, most businesses report **quarterly**. Some small businesses can report annually.
- Quarterly due dates: {{fact:au.bas.quarterlyDueDates}}. Registered BAS and tax agents usually get later dates.

## The BAS labels

A **full BAS** reports GST like this:

| Label | What goes in it |
|---|---|
| **G1** Total sales | All sales, **including GST**: taxable, GST-free and input-taxed. Not BAS-excluded items |
| **G2** Export sales | GST-free exports (also included in G1) |
| **G3** Other GST-free sales | Other GST-free sales (also included in G1) |
| **G4** Input-taxed sales | Also included in G1 (on the worksheet) |
| **G10** Capital purchases | Capital purchases, including GST |
| **G11** Non-capital purchases | All other purchases, including GST |
| **1A** GST on sales | The GST you collected |
| **1B** GST on purchases | The GST credits you claim |

**Net GST = 1A − 1B.** Positive means you pay the ATO; negative means a refund.

Businesses with GST turnover under {{fact:au.gst.simplerBasTurnoverLimit}} use **Simpler BAS** by default and only report G1, 1A and 1B.

The BAS also carries PAYG withholding (W1, W2), PAYG instalments, fuel tax credits and other taxes, depending on the business. See the PAYG and super page.

## GST in the ledger

Selling a service for 1,100 including GST:

| Account | Debit | Credit |
|---|---|---|
| Accounts Receivable | 1,100 | |
| Sales | | 1,000 |
| GST | | 100 |

Buying office supplies for 220 including GST:

| Account | Debit | Credit |
|---|---|---|
| Office Expenses | 200 | |
| GST | 20 | |
| Accounts Payable | | 220 |

One **GST** liability account carries both sides; its balance at the end of the period is what you owe (or are owed). Paying the BAS clears it:

| Account | Debit | Credit |
|---|---|---|
| GST | 80 | |
| Bank | | 80 |

## Common mistakes

- Claiming GST on a purchase from a supplier that is not registered (no GST on the invoice means none to claim).
- Claiming GST on bank fees, most insurance stamp duty, or overseas software subscriptions that charged none.
- Putting wages or super through a GST code instead of BAS excluded.
- Claiming the full GST on an item used partly for private purposes.
- Coding a capital purchase to G11 instead of G10.

## In Xero / QBO

Each line of a bill or invoice carries a tax rate such as *GST on Expenses*, *GST Free Expenses* or *BAS Excluded*. The BAS report is built entirely from those codes, so **the tax code on each line is the BAS**. A wrong code is a wrong BAS. See the setup page and the **Coding scenarios**.

## Practise

Fill a BAS from a list of transactions in the **Tax calculator** (BAS tab), and code real-looking bills in **Coding scenarios**.

## Sources

- [ATO: How GST works](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/how-gst-works)
- [ATO: Tax invoices](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices)
- [ATO: BAS due dates](https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas/due-dates-for-lodging-and-paying-your-bas)

Figures shown as badges come from the facts registry and carry their own source and check date. Other figures in the text (deadlines, examples) have not each been checked against a source: confirm them at the links above before relying on them.
