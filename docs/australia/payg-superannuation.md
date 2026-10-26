---
title: PAYG and superannuation
summary: PAYG withholding, PAYG instalments, Single Touch Payroll, the super guarantee and Payday Super from 1 July 2026.
jurisdiction: AU
level: beginner
order: 2
facts: [au.super.guaranteeRate, au.super.maxContributionBaseAnnual, au.super.paydaySuperStart, au.super.paydayDeadlineBusinessDays]
tools: [tax, journal]
---

Australian payroll has three moving parts a bookkeeper must get right every pay run: **PAYG withholding** (income tax taken from wages), **superannuation** (retirement contributions the employer pays on top), and **Single Touch Payroll** (reporting each pay run to the ATO).

## PAYG withholding

**Pay As You Go (PAYG) withholding** is the income tax an employer deducts from employees' pay and sends to the ATO.

- The amount comes from the ATO's **tax tables** and depends on the pay frequency, whether the employee claims the tax-free threshold (on their TFN declaration), study loan debts and other factors. Payroll software applies the tables.
- If a supplier does not quote an **ABN**, the business must withhold at the top marginal rate from the payment (reported at W4).
- Reported on the BAS: **W1** total salary, wages and other payments; **W2** amounts withheld from them; **W4** amounts withheld where no ABN was quoted; **W5** total withheld.

This site does not calculate PAYG withholding. The tax tables change and a simplified version would teach wrong numbers. Use the ATO's tax withheld calculator.

Pay run for a gross wage of 2,000 with 300 withheld (an illustrative amount, not from the tax tables):

| Account | Debit | Credit |
|---|---|---|
| Wages and Salaries | 2,000 | |
| PAYG Withholdings Payable | | 300 |
| Bank (net pay) | | 1,700 |

## PAYG instalments

Separate from withholding: **PAYG instalments** are prepayments of the **business's own** (or a sole trader's) income tax, paid with the BAS during the year and credited against the final tax bill. The ATO sets the instalment amount or rate.

## Single Touch Payroll (STP)

Employers report each employee's pay, tax withheld and super to the ATO **every pay run**, through STP-enabled payroll software (STP Phase 2). At the end of the financial year the employer makes a **finalisation** declaration, which makes the employee's income statement "tax ready" in myGov. There are no more payment summaries.

## Superannuation guarantee

Employers must pay **super guarantee (SG)** contributions of at least {{fact:au.super.guaranteeRate}} of each eligible employee's earnings into a complying super fund. Super is paid **on top of** wages, not deducted from them.

- Since 1 July 2022 there is no minimum monthly earnings threshold: almost every employee is eligible, with special rules for under-18s working 30 hours or less a week and private or domestic workers.
- Contractors who are paid mainly for their labour can count as employees for super.
- The **maximum contribution base** caps the earnings SG is calculated on: {{fact:au.super.maxContributionBaseAnnual}} for the year.

### Payday Super

From **{{fact:au.super.paydaySuperStart}}**, super is no longer paid quarterly. Under **Payday Super**:

- SG is calculated on each payday's **qualifying earnings** (ordinary time earnings plus other amounts such as commissions and salary sacrifice).
- The contribution must reach the employee's fund within **{{fact:au.super.paydayDeadlineBusinessDays}} business days** of payday.
- The ATO's Small Business Superannuation Clearing House closed on 1 July 2026; employers pay through their payroll software, a commercial clearing house or directly.
- Late or short payments attract the **super guarantee charge**, which is not tax deductible, plus penalties.

Earnings paid up to 30 June 2026 follow the old quarterly rules (due 28 days after each quarter).

Accruing super on that 2,000 pay run at {{fact:au.super.guaranteeRate}}:

| Account | Debit | Credit |
|---|---|---|
| Superannuation (expense) | 240 | |
| Superannuation Payable | | 240 |

Paying it to the fund a few days later clears the liability: debit Superannuation Payable, credit Bank. Super and wages are **BAS excluded**: no GST.

## Other payroll obligations

- **Payroll tax**: a state and territory tax on wages above each state's threshold. Different rates and thresholds in each state.
- **Workers' compensation** insurance: compulsory, state-based.
- **Leave**: annual leave and long service leave accrue as liabilities (employee benefits) at each period end.
- **TPAR**: businesses in building and construction, cleaning, courier and road freight, IT, and security services report payments to contractors on the **Taxable payments annual report**, due 28 August.

## AU vs UK

| | Australia | United Kingdom |
|---|---|---|
| Income tax on wages | PAYG withholding (tax tables) | PAYE (tax codes) |
| Reporting each pay run | Single Touch Payroll | RTI Full Payment Submission |
| Employer contribution | Super guarantee {{fact:au.super.guaranteeRate}} | Employer NIC (a tax) plus auto-enrolment pension |
| When the employer contribution is due | With each payday (from July 2026) | NIC with PAYE monthly; pension by the 22nd of the next month |

## Common mistakes

- Deducting super from the employee's gross pay instead of paying it on top.
- Coding super or wages with a GST tax code.
- Calculating SG on overtime (overtime is usually not ordinary time earnings, though other qualifying earnings rules apply under Payday Super).
- Forgetting that a contractor paid for their labour may be owed super.

## Practise

Use the **Super guarantee** tab of the Tax calculator and the payroll scenarios in the **Journal simulator**.

## Sources

- [ATO: About Payday Super](https://www.ato.gov.au/businesses-and-organisations/super-for-employers/payday-super/about-payday-super)
- [ATO: Super guarantee rate](https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/super-guarantee)
- [ATO: Single Touch Payroll](https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/single-touch-payroll)
- [ATO: Tax withheld calculator](https://www.ato.gov.au/calculators-and-tools/tax-withheld-calculator)

Figures shown as badges come from the facts registry and carry their own source and check date. Other figures in the text (deadlines, examples) have not each been checked against a source: confirm them at the links above before relying on them.
