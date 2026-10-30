---
title: VAT and Making Tax Digital
summary: UK VAT rates and treatments, registration, VAT invoices, the nine boxes of the VAT return, reverse charge, and what MTD requires.
jurisdiction: UK
level: beginner
order: 1
facts: [uk.vat.standardRate, uk.vat.reducedRate, uk.vat.registrationThreshold, uk.vat.deregistrationThreshold, uk.vat.returnDeadline, uk.mtd.itsaStart, uk.mtd.itsaThreshold2026, uk.mtd.itsaThreshold2027, uk.mtd.itsaStart2027, uk.mtd.itsaThreshold2028, uk.mtd.itsaStart2028]
tools: [tax, coding, journal]
---

**Value Added Tax (VAT)** is charged on most goods and services supplied by VAT-registered businesses in the UK. A registered business charges **output VAT** on its sales, reclaims **input VAT** on its business purchases, and pays the difference to **HM Revenue & Customs (HMRC)** on its VAT return.

## Rates and treatments

| Treatment | Rate | Can reclaim VAT on related costs? | Examples |
|---|---|---|---|
| **Standard-rated** | {{fact:uk.vat.standardRate}} | Yes | Most goods and services |
| **Reduced-rated** | {{fact:uk.vat.reducedRate}} | Yes | Domestic fuel and power, children's car seats |
| **Zero-rated** | 0% | Yes | Most food, books and newspapers, children's clothes, exports of goods |
| **Exempt** | none | **No** (partial exemption rules) | Insurance, finance, most residential rent, some education and health |
| **Outside the scope** | none | n/a | Wages, statutory fees, MOT certificates, donations with nothing in return |

Zero-rated and exempt both mean no VAT on the invoice, but they are different: a zero-rated supply is a taxable supply at 0% (so related input VAT is reclaimable, and it counts towards the registration threshold); an exempt supply is not taxable.

Working out VAT at {{fact:uk.vat.standardRate}}: on a net price, multiply by 20%; in a gross (VAT-inclusive) price, VAT is **1/6** of the total (20/120).

## Registration

You must register if your **taxable turnover** for the last 12 months goes over {{fact:uk.vat.registrationThreshold}}, or you expect it to in the next 30 days alone. You can ask to deregister if it falls below {{fact:uk.vat.deregistrationThreshold}}. Voluntary registration below the threshold is allowed and common for businesses selling to other VAT-registered businesses.

## VAT invoices

A full VAT invoice shows: a unique number, the supplier's name, address and **VAT registration number**, the invoice date and the time of supply (tax point) if different, the customer's name and address, a description, quantity and price of each item, the rate of VAT per item, the total excluding VAT, and the total VAT. Simplified invoices are allowed for retail sales up to £250.

## The VAT return (VAT 100)

| Box | What goes in it |
|---|---|
| **1** | VAT due on sales and other outputs, **including reverse-charge VAT on purchases** |
| **2** | VAT due on goods acquired from the EU (Northern Ireland only) |
| **3** | Box 1 + box 2 |
| **4** | VAT reclaimed on purchases and other inputs (including reverse-charge VAT) |
| **5** | Box 3 − box 4: net VAT to pay, or to reclaim |
| **6** | Total value of sales excluding VAT, **whole pounds**: standard, reduced, zero-rated and exempt |
| **7** | Total value of purchases excluding VAT, whole pounds |
| **8** | Goods supplied to the EU (Northern Ireland only) |
| **9** | Goods acquired from the EU (Northern Ireland only) |

Wages, VAT payments to HMRC, loans and dividends are outside the scope: they appear in no box.

The deadline is {{fact:uk.vat.returnDeadline}}. Late returns earn **penalty points**; enough points trigger a £200 penalty. Late payment attracts separate penalties and interest.

## Reverse charge

Under the **reverse charge**, the **customer** accounts for VAT instead of the supplier:

- **Services from overseas** (e.g. a software subscription billed from Ireland): the UK business puts the VAT in box 1 and reclaims it in box 4, and the net value in boxes 6 and 7.
- **Construction (domestic reverse charge, VAT Notice 735)**: for construction services reported under CIS between VAT-registered businesses, where the customer is not the end user. The supplier's invoice shows no VAT to pay. The customer puts the VAT in **box 1**, reclaims it in **box 4**, and puts the net value in **box 7** (not box 6). The supplier puts the net value in box 6 and no VAT in box 1.

For a fully taxable business the reverse charge nets to zero, but both sides must still be reported.

## Schemes

- **Flat Rate Scheme**: pay a fixed percentage of gross turnover; generally no input VAT reclaim (except some capital items). For small businesses.
- **Cash Accounting Scheme**: account for VAT when paid and received.
- **Annual Accounting Scheme**: one return a year with interim payments.

## Making Tax Digital (MTD)

**MTD for VAT** applies to every VAT-registered business: VAT records must be kept digitally and returns filed through **MTD-compatible software** (Xero, QBO, Sage, or bridging software from spreadsheets). The old HMRC online VAT form is closed to almost everyone.

Digital records means the figures flow from software to HMRC without retyping; copying numbers by hand between systems breaks the **digital link** rule.

**MTD for Income Tax** started on {{fact:uk.mtd.itsaStart}} for sole traders and landlords with qualifying income over {{fact:uk.mtd.itsaThreshold2026}} (over {{fact:uk.mtd.itsaThreshold2027}} from {{fact:uk.mtd.itsaStart2027}}, over {{fact:uk.mtd.itsaThreshold2028}} from {{fact:uk.mtd.itsaStart2028}}). They keep digital records and send quarterly updates. The *Making Tax Digital* guide in this path covers both schemes in more detail.

## VAT in the ledger

Invoice a client £1,000 + VAT:

| Account | Debit | Credit |
|---|---|---|
| Trade Debtors | 1,200 | |
| Sales | | 1,000 |
| VAT | | 200 |

Buy office supplies for £120 including VAT:

| Account | Debit | Credit |
|---|---|---|
| Office Expenses | 100 | |
| VAT | 20 | |
| Trade Creditors | | 120 |

## Common mistakes

- Reclaiming VAT on business entertaining of clients (blocked).
- Reclaiming VAT on a car bought for mixed use (usually blocked).
- Treating an exempt supply as zero-rated, or the other way round.
- Putting a construction reverse-charge purchase value in box 6.
- Reclaiming VAT from a supplier that is not VAT registered.

## In Xero / QBO

Each line carries a VAT rate such as *20% (VAT on Expenses)*, *Zero Rated Expenses*, *Exempt Expenses* or *No VAT*. The VAT return is built from those rates, so the rate on each line is the return.

## Practise

Build a VAT 100 return from transactions in the **Tax calculator**, and code real-looking bills in **Coding scenarios**.

## Sources

- [HMRC: VAT rates](https://www.gov.uk/vat-rates)
- [HMRC: How to fill in your VAT Return (Notice 700/12)](https://www.gov.uk/guidance/how-to-fill-in-and-submit-your-vat-return-vat-notice-70012)
- [HMRC: Domestic reverse charge (Notice 735)](https://www.gov.uk/guidance/the-vat-domestic-reverse-charge-procedure-notice-735)
- [HMRC: Making Tax Digital for Income Tax](https://www.gov.uk/government/collections/making-tax-digital-for-income-tax)

Figures shown as badges come from the facts registry and carry their own source and check date. Other figures in the text (deadlines, examples) have not each been checked against a source: confirm them at the links above before relying on them.
