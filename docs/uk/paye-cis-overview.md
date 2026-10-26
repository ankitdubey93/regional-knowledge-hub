---
title: PAYE, National Insurance and CIS
summary: Running UK payroll: PAYE and tax codes, RTI, employer and employee NIC, the Employment Allowance, pensions auto-enrolment, and the Construction Industry Scheme.
jurisdiction: UK
level: beginner
order: 2
facts: [uk.nic.employerRate, uk.nic.secondaryThresholdAnnual, uk.nic.employmentAllowance, uk.cis.registeredRate, uk.cis.unregisteredRate]
tools: [tax, journal]
---

## PAYE

**Pay As You Earn (PAYE)** is HMRC's system for collecting income tax and National Insurance from employees' pay. The employer registers as an employer, runs payroll each pay period, deducts tax and employee NIC, and pays them to HMRC along with employer NIC.

- Each employee has a **tax code** (e.g. `1257L`) issued by HMRC that tells payroll software how much tax-free pay to allow. Codes change; always use the latest one HMRC sends.
- Payroll software applies the code and the tax bands. This site does not calculate PAYE income tax: the bands differ between England, Wales, Northern Ireland and Scotland, and a simplified calculator would teach wrong numbers.

**Real Time Information (RTI)**: on or before each payday, the employer sends a **Full Payment Submission (FPS)** to HMRC. An **Employer Payment Summary (EPS)** reports reductions such as the Employment Allowance or statutory pay recovery.

PAYE and NIC are paid to HMRC by the **22nd** of the following month electronically (19th by post), or quarterly for small employers.

At year end (5 April): give each employee a **P60** by 31 May; report benefits in kind on **P11D** forms (unless payrolled) by 6 July.

## National Insurance

| Class | Who pays | On what |
|---|---|---|
| Class 1 primary | Employee | Earnings above the primary threshold |
| Class 1 secondary | **Employer** | Earnings above the secondary threshold |
| Class 1A | Employer | Most taxable benefits in kind |
| Class 2 / 4 | Self-employed | Profits |

**Employer (secondary) NIC** is {{fact:uk.nic.employerRate}} of each employee's earnings above the secondary threshold of {{fact:uk.nic.secondaryThresholdAnnual}} a year. Lower rates (0% up to an upper threshold) apply to employees under 21, apprentices under 25 and veterans.

The **Employment Allowance** lets eligible employers reduce their annual employer NIC bill by up to {{fact:uk.nic.employmentAllowance}}. A company whose only employee paid above the secondary threshold is a director is **not** eligible.

## Pensions auto-enrolment

Employers must enrol eligible workers aged 22 to State Pension age earning over the earnings trigger into a workplace pension, and contribute at least the legal minimum (in total, at least 8% of qualifying earnings, of which the employer pays at least 3%). Workers can opt out. The employer must declare compliance to The Pensions Regulator.

## Payroll journal

A monthly pay run: gross pay £3,000, PAYE £300 and employee NIC £120 (illustrative amounts: real ones come from the tax code and NIC tables), employee pension £120, employer pension £90. Employer NIC is {{fact:uk.nic.employerRate}} of the pay above the monthly secondary threshold of £417: (£3,000 − £417) × 15% = £387.45.

| Account | Debit | Credit |
|---|---|---|
| Salaries | 3,000 | |
| Employer's NIC | 387.45 | |
| Employer's Pensions | 90 | |
| PAYE & NIC Payable (300 + 120 + 387.45) | | 807.45 |
| Pensions Payable (120 + 90) | | 210 |
| Wages Payable – Payroll (net pay) | | 2,460 |

Net pay = 3,000 − 300 − 120 − 120 = 2,460. Paying the staff, HMRC and the pension provider each debits its payable and credits the bank. Payroll is outside the scope of VAT.

## Construction Industry Scheme (CIS)

**CIS** applies when a **contractor** pays a **subcontractor** for construction work. The contractor must:

1. **Register** with HMRC as a contractor.
2. **Verify** each subcontractor with HMRC before paying them. HMRC says which rate to use.
3. **Deduct** CIS from the labour part of each payment:
   - {{fact:uk.cis.registeredRate}} for a registered subcontractor;
   - {{fact:uk.cis.unregisteredRate}} for one who is not registered or cannot be verified;
   - 0% for a subcontractor with **gross payment status**.
4. File a **monthly CIS return** by the 19th, and pay the deductions to HMRC with PAYE.
5. Give each subcontractor a **payment and deduction statement**.

The deduction applies to **labour only**: not to materials the subcontractor bought, not to VAT, not to the CITB levy.

A subcontractor invoices £2,000 labour + £500 materials, not VAT registered, verified at {{fact:uk.cis.registeredRate}}:

| Account | Debit | Credit |
|---|---|---|
| Subcontractors | 2,500 | |
| CIS Deductions Payable (20% × 2,000) | | 400 |
| Trade Creditors (paid to subcontractor) | | 2,100 |

If the subcontractor is VAT registered and the job falls under the **domestic reverse charge**, the invoice shows no VAT to pay and the contractor accounts for it on the VAT return (see the VAT page).

## AU vs UK

| | Australia | United Kingdom |
|---|---|---|
| Tax on wages | PAYG withholding, tax tables | PAYE, tax codes |
| Real-time reporting | STP | RTI (FPS) |
| Employer cost on top of wages | Super guarantee (into the employee's fund) | Employer NIC (a tax) plus pension contributions |
| Construction | TPAR reporting, no deduction | CIS deductions from subcontractors |

## Common mistakes

- Deducting CIS from the materials or VAT on a subcontractor's invoice.
- Paying a new subcontractor before verifying them.
- Claiming the Employment Allowance for a sole-director company.
- Posting net pay to the Salaries account instead of gross pay.

## Practise

Use the **Employer NIC** and **CIS** tabs of the Tax calculator and the payroll scenarios in the **Journal simulator**.

## Sources

- [HMRC: Rates and thresholds for employers 2026 to 2027](https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027)
- [HMRC: CIS 340 guide](https://www.gov.uk/government/publications/construction-industry-scheme-cis-340)
- [The Pensions Regulator: automatic enrolment](https://www.thepensionsregulator.gov.uk/en/employers)

Figures shown as badges come from the facts registry and carry their own source and check date. Other figures in the text (deadlines, examples) have not each been checked against a source: confirm them at the links above before relying on them.
