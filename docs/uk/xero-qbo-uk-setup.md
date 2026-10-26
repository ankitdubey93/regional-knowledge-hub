---
title: Setting up Xero or QuickBooks for a UK business
summary: Organisation settings, VAT scheme and MTD connection, the chart of accounts, VAT rates, CIS, payroll and pensions, bank feeds and filing the VAT return.
jurisdiction: UK
level: beginner
order: 4
facts: [uk.vat.standardRate, uk.vat.reducedRate, uk.vat.returnDeadline, uk.cis.registeredRate]
tools: [coding]
---

Xero, QuickBooks Online, Sage and FreeAgent dominate UK small business bookkeeping. This page uses Xero's names, with QBO notes. Check the exact names in the client's own file.

## 1. Organisation and financial settings

- **Legal name, company number, registered office**, and **VAT registration number** if registered.
- **Financial year end**: the company's accounting reference date (often 31 March, or the month it was incorporated). Sole traders: the tax year ends on 5 April, but the business can choose its own year end (basis period reform moved everyone onto tax-year basis from 2024–25).
- **VAT**: registered or not; the **VAT scheme** (standard accrual, cash accounting, flat rate) and the **VAT period** (usually quarterly, staggered to one of three quarter patterns).
- **Lock dates** after each VAT return is filed.
- **Conversion balances** if moving from another system.

## 2. Connect to HMRC for MTD

VAT returns must be filed through MTD-compatible software. In Xero: connect the organisation to HMRC (the person authorising needs the business's Government Gateway credentials), and Xero pulls the VAT **obligations** (period dates) from HMRC. Returns are then submitted from Xero; the deadline is {{fact:uk.vat.returnDeadline}}.

## 3. Chart of accounts

Start from the default UK chart. Accounts every UK company file needs:

| Account | Type | Notes |
|---|---|---|
| VAT | Current liability | System account, both sides of VAT |
| PAYE & NIC Payable | Current liability | From payroll |
| Pensions Payable | Current liability | Auto-enrolment |
| CIS Deductions Payable | Current liability | Contractors only |
| Corporation Tax | Current liability | Year-end provision |
| Directors' Loan Account | Liability (or asset if overdrawn) | Watch overdrawn balances: tax charges apply |
| Share Capital, Retained Earnings | Equity | |

Set each account's default VAT rate (Rent → depends on whether the landlord opted to tax; Insurance → Exempt Expenses; Salaries → No VAT).

## 4. VAT rates

Xero's default UK VAT rates:

| Xero name | Rate | Box(es) |
|---|---|---|
| 20% (VAT on Income) | {{fact:uk.vat.standardRate}} | 1 and 6 |
| 5% (VAT on Income) | {{fact:uk.vat.reducedRate}} | 1 and 6 |
| Zero Rated Income | 0% | 6 |
| Exempt Income | 0% | 6 |
| 20% (VAT on Expenses) | {{fact:uk.vat.standardRate}} | 4 and 7 |
| 5% (VAT on Expenses) | {{fact:uk.vat.reducedRate}} | 4 and 7 |
| Zero Rated Expenses | 0% | 7 |
| Exempt Expenses | 0% | 7 |
| No VAT | n/a | none |
| Domestic reverse charge rates | {{fact:uk.vat.standardRate}} | 1, 4 and 7 (customer) |
| Reverse charge on services from abroad | {{fact:uk.vat.standardRate}} | 1, 4, 6 and 7 |

QBO's UK codes are shorter (for example *20.0% S*, *5.0% R*, *0.0% Z*, *Exempt*, *No VAT*) and map to the same boxes.

## 5. CIS

If the business is a contractor in construction: turn on CIS in the software, record each subcontractor's UTR and verification number, and set the deduction rate HMRC gave (usually {{fact:uk.cis.registeredRate}}). Bills from subcontractors then split labour and materials and post the deduction to CIS Deductions Payable. The monthly CIS return is filed by the 19th.

If the business is itself a subcontractor, CIS deducted by its contractors is a credit against its own PAYE (for a company) or income tax (for a sole trader); record it as an asset (CIS suffered) rather than an expense.

## 6. Payroll and pensions

Xero Payroll, QBO Payroll or a dedicated bureau: set up the PAYE reference and Accounts Office reference, each employee's tax code and NI category, and the workplace pension. RTI submissions go to HMRC each pay run; pension contributions go to the provider.

## 7. Bank feeds and rules

Connect every bank account, card and payment platform. Use bank rules for regular items, but review them. Reconcile at least weekly.

## 8. Filing the VAT return

1. Reconcile all bank accounts to the period end.
2. Review the VAT audit report for unusual rates (VAT claimed on entertainment, a sale coded as exempt).
3. Check the VAT account balance agrees with box 5.
4. Submit through MTD, then record the payment to HMRC against the VAT account.
5. Set the lock date.

## Common mistakes

- Filing a VAT return outside MTD software.
- Leaving *20% (VAT on Expenses)* as the default on insurance or bank charges.
- Posting CIS deductions suffered (as a subcontractor) to an expense.
- Mismatching the VAT period dates with HMRC's obligations, so the return covers the wrong months.

## Practise

The **Coding scenarios** use a chart and VAT rates like the ones above.

## Sources

- [HMRC: Making Tax Digital for VAT](https://www.gov.uk/guidance/making-tax-digital-for-vat)
- [Xero Central (help centre)](https://central.xero.com/)

Figures shown as badges come from the facts registry and carry their own source and check date. Other figures in the text (deadlines, examples) have not each been checked against a source: confirm them at the links above before relying on them.
