---
title: Setting up Xero or QuickBooks for an Australian business
summary: Organisation settings, GST basis and period, the chart of accounts, tax rates, payroll with STP and super, bank feeds and the BAS report.
jurisdiction: AU
level: beginner
order: 4
facts: [au.gst.rate, au.gst.cashBasisTurnoverLimit, au.super.paydaySuperStart]
tools: [coding]
---

Most Australian small businesses use **Xero**, **MYOB** or **QuickBooks Online**. The setup decisions are the same in all of them; this page uses Xero's names, and notes QBO where it differs. Check names in the client's own file: software labels change.

## 1. Organisation and financial settings

- **Legal name, trading name and ABN.** The ABN must appear on every tax invoice.
- **Financial year end: 30 June** (standard in Australia).
- **GST registered**: yes or no. If yes, choose:
  - **Accounting basis**: accruals (invoice) or cash (payments). Cash is available under {{fact:au.gst.cashBasisTurnoverLimit}} aggregated turnover.
  - **Reporting period**: monthly, quarterly or annually.
- **Lock dates**: set after each BAS is lodged so nobody changes a reported period.
- **Conversion date and balances** if moving from another system: bring across the trial balance, open invoices and open bills at that date.

## 2. Chart of accounts

Start from the default AU chart and adapt it rather than building one from scratch. Keep it short: an account exists to answer a question someone actually asks.

Accounts every AU file needs:

| Account | Type | Notes |
|---|---|---|
| GST | Current liability | System account; both sides of GST |
| PAYG Withholdings Payable | Current liability | From payroll |
| Superannuation Payable | Current liability | From payroll |
| Wages and Salaries, Superannuation | Expense | Payroll |
| Owner Drawings / Funds Introduced | Equity | Sole traders and partnerships |
| Loan – Director | Liability or asset | Companies (watch Division 7A rules for loans to directors) |

Each account has a **default tax rate**. Set sensible defaults (Rent → GST on Expenses, Bank Fees → GST Free Expenses, Wages → BAS Excluded) so most lines code themselves correctly.

## 3. Tax rates

Xero's default AU tax rates:

| Xero name | Rate | Use for |
|---|---|---|
| GST on Income | {{fact:au.gst.rate}} | Taxable sales |
| GST on Expenses | {{fact:au.gst.rate}} | Taxable purchases |
| GST on Capital | {{fact:au.gst.rate}} | Capital purchases (goes to G10) |
| GST Free Income / GST Free Expenses | 0% | GST-free sales and purchases |
| Input Taxed | 0% | Input-taxed sales and related purchases |
| BAS Excluded | 0% | Wages, super, loans, transfers, drawings |
| GST on Imports | 100% of the GST amount | GST paid to Customs on imported goods |

QBO uses shorter codes (for example *GST*, *GST free*, *Input taxed*, *Out of scope*) mapped to the same BAS labels.

## 4. Payroll, STP and super

- Connect the payroll module to the ATO for **Single Touch Payroll**.
- Set up each employee with their TFN declaration, super fund (or stapled fund), pay rate and leave entitlements.
- Map payroll accounts: Wages expense, PAYG Withholdings Payable, Superannuation expense and payable.
- From {{fact:au.super.paydaySuperStart}}, super is paid with each pay run under Payday Super: turn on the software's super payment feature or arrange a clearing house, and check that contributions reach funds in time.

## 5. Bank feeds and rules

- Connect bank feeds for every bank account and credit card.
- Create **bank rules** for regular items (the monthly bank fee, the rent direct debit), but review them: a rule codes everything that matches, including the one-off that should not.
- Reconcile at least weekly.

## 6. The BAS report

Xero builds the **Activity Statement** from the tax rate on every line. Before lodging:

1. Reconcile all bank accounts to the end of the period.
2. Review the **GST reconciliation** or audit report: any transactions with unusual tax rates?
3. Check that the GST account balance agrees with the BAS net amount.
4. Lodge (directly from Xero, through a BAS agent, or in the ATO portal), then mark it as filed and set the lock date.
5. Record the payment or refund against the GST account.

## Common mistakes

- Leaving the default tax rate on an account wrong, so every transaction coded there is wrong on the BAS.
- Coding an owner's personal purchase to an expense with GST.
- Changing a lodged period, so the next BAS no longer reconciles.
- Using *GST on Expenses* for an overseas subscription that charged no GST.

## Practise

The **Coding scenarios** use a chart and tax rates like the ones above.

## Sources

- [ATO: Choosing an accounting method for GST](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/accounting-for-gst-in-your-business/choosing-an-accounting-method)
- [Xero Central (help centre)](https://central.xero.com/)

Figures shown as badges come from the facts registry and carry their own source and check date. Other figures in the text (deadlines, examples) have not each been checked against a source: confirm them at the links above before relying on them.
