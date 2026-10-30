---
title: Making Tax Digital
summary: What HMRC's Making Tax Digital rules require for VAT and for Income Tax, who is in scope and when, digital records and links, quarterly updates, and the tax return that still follows.
jurisdiction: UK
level: beginner
order: 5
facts: [uk.mtd.itsaStart, uk.mtd.itsaThreshold2026, uk.mtd.itsaStart2027, uk.mtd.itsaThreshold2027, uk.mtd.itsaStart2028, uk.mtd.itsaThreshold2028, uk.mtdItsa.updateDueMonthsAfter, uk.mtdItsa.updateDueDay]
---

**Making Tax Digital (MTD)** is HMRC's programme for keeping tax records digitally and filing through compatible software instead of paper or the old online forms. Two schemes are in force: one for **VAT** and one for **Income Tax**. They are separate, with different people in scope and different filing rules.

## MTD for VAT

MTD for VAT requires all VAT-registered businesses to keep their records digitally and to file their VAT returns using software.

The software must keep the required records, prepare the return from them, and send it to HMRC through HMRC's API. The VAT return itself (the nine boxes, the rates and the deadlines) is covered in the VAT guide in this path.

## Digital records and digital links

A **digital link** is how data moves from one program to the next without anyone retyping it. Moving data between programs must be a digital link, for example:

- linked cells in a spreadsheet
- XML or CSV import and export
- automated data transfer
- an API

HMRC does not count cut and paste or copy and paste as a digital link. This matters most when a spreadsheet feeds bridging software: the totals must reach the software by a link, not by hand.

## MTD for Income Tax

**MTD for Income Tax** applies to sole traders and landlords whose qualifying income is over the threshold for the year. The groups start in stages:

| Qualifying income over | Must use MTD from | HMRC checks the return for |
|---|---|---|
| {{fact:uk.mtd.itsaThreshold2026}} | {{fact:uk.mtd.itsaStart}} | 2024 to 2025 |
| {{fact:uk.mtd.itsaThreshold2027}} | {{fact:uk.mtd.itsaStart2027}} | 2025 to 2026 |
| {{fact:uk.mtd.itsaThreshold2028}} | {{fact:uk.mtd.itsaStart2028}} | 2026 to 2027 |

HMRC decides from the Self Assessment return of an earlier tax year, shown in the third column.

Partnerships will join later; HMRC has not set the timeline.

A limited company is not in MTD for Income Tax: its profits are taxed through Corporation Tax.

## Qualifying income

**Qualifying income** is total income from self-employment and UK property before expenses (turnover). It is not profit. Foreign income that is not declared on the UK Self Assessment return does not count. Wages and dividends are not part of it.

## Quarterly updates and the tax return

Under MTD for Income Tax, **quarterly updates** go from compatible software, one for each quarter of the tax year. Each is due {{fact:uk.mtdItsa.updateDueMonthsAfter}} month after the quarter ends, on day {{fact:uk.mtdItsa.updateDueDay}} of that month.

A Self Assessment tax return is still submitted after the tax year. The quarterly updates do not replace it.

## Exemptions

Some people are exempt, for example because they are digitally excluded. An exempt person still reports on a Self Assessment return.

## Common mistakes

- Retyping or copy-pasting figures between programs, which breaks the digital link.
- Working out qualifying income from profit instead of turnover.
- Counting wages or dividends as qualifying income.
- Treating the quarterly updates as the tax return.
- Assuming a limited company is in MTD for Income Tax.

## In Xero / QBO

Xero and QuickBooks file VAT returns through MTD from inside the software. Before relying on any product for Income Tax, check that it is on HMRC's list of compatible software (linked in Sources).

## Practise

Test yourself with the Making Tax Digital quiz and flashcards under Practice.

## Sources

- [HMRC: VAT Notice 700/22: Making Tax Digital for VAT](https://www.gov.uk/government/publications/vat-notice-70022-making-tax-digital-for-vat/vat-notice-70022-making-tax-digital-for-vat)
- [HMRC: Find out if and when you need to use Making Tax Digital for Income Tax](https://www.gov.uk/guidance/find-out-if-and-when-you-need-to-use-making-tax-digital-for-income-tax)
- [HMRC: Work out your qualifying income for Making Tax Digital for Income Tax](https://www.gov.uk/guidance/work-out-your-qualifying-income-for-making-tax-digital-for-income-tax)
- [HMRC: Send quarterly updates](https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates)
- [HMRC: Find software that's compatible with Making Tax Digital for VAT](https://www.gov.uk/guidance/find-software-thats-compatible-with-making-tax-digital-for-vat)
- [HMRC: Find software that's compatible with Making Tax Digital for Income Tax](https://www.gov.uk/guidance/find-software-thats-compatible-with-making-tax-digital-for-income-tax)

Figures shown as badges come from the facts registry and carry their own source and check date. Other figures in the text (deadlines, examples) have not each been checked against a source: confirm them at the links above before relying on them.
