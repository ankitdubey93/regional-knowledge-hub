# Prose figures to verify

Working file, not a record of verification. Nothing here is marked verified (Hard rule 2). Input for a follow-up content plan that moves each figure into `kb_fact` with an official source. Line numbers are as of 2026-10-28.

| Doc | Line | Text (quoted, ≤ 15 words) | Kind | Proposed fact key | Official source to check |
|---|---|---|---|---|---|
| docs/australia/bas-gst-guide.md | 36 | register for GST within 21 days once your GST turnover | deadline | au.gst.registrationDays | ato.gov.au |
| docs/australia/bas-gst-guide.md | 42 | A supplier must give one within 28 days of being asked | deadline | au.gst.taxInvoiceRequestDays | ato.gov.au |
| docs/australia/corporations-act-thresholds.md | 44 | shareholders with at least 5% of votes direct it | threshold | au.corps.auditRequestVotesPct | legislation.gov.au |
| docs/australia/corporations-act-thresholds.md | 54 | would allow financial statements to be prepared and audited, for 7 years | date | au.corps.recordKeepingYears | legislation.gov.au |
| docs/australia/corporations-act-thresholds.md | 57 | update ASIC within 28 days of changes to officeholders, addresses or shares | deadline | au.corps.asicUpdateDays | asic.gov.au |
| docs/australia/payg-superannuation.md | 43 | under-18s working 30 hours or less a week | threshold | au.super.under18HoursPerWeek | ato.gov.au |
| docs/australia/payg-superannuation.md | 43 | Since 1 July 2022 there is no minimum monthly earnings threshold | date | au.super.noMinimumEarningsFrom | ato.gov.au |
| docs/australia/payg-superannuation.md | 53 | Small Business Superannuation Clearing House closed on 1 July 2026 | date | au.super.sbsch.closed | ato.gov.au |
| docs/australia/payg-superannuation.md | 56 | old quarterly rules (due 28 days after each quarter) | deadline | au.super.quarterlyDueDays | ato.gov.au |
| docs/australia/payg-superannuation.md | 56 | Earnings paid up to 30 June 2026 follow the old quarterly rules | date | au.super.paydaySuperPreviousRulesEnd | ato.gov.au |
| docs/australia/payg-superannuation.md | 72 | Taxable payments annual report, due 28 August | deadline | au.tpar.dueDate | ato.gov.au |
| docs/australia/payg-superannuation.md | 3 | the super guarantee and Payday Super from 1 July 2026 | date | (same as au.super.paydaySuperStart; check it matches) | ato.gov.au |
| docs/australia/payg-superannuation.md | 81 | With each payday (from July 2026) | date | (same as au.super.paydaySuperStart) | ato.gov.au |
| docs/australia/payg-superannuation.md | 81 | pension by the 22nd of the next month | deadline | uk.pensions.contributionDueDay | thepensionsregulator.gov.uk |
| docs/core-accounting/month-end-close-checklist.md | 66 | payable with each payday from 1 July 2026 (Payday Super) | date | (same as au.super.paydaySuperStart) | ato.gov.au |
| docs/standards/ifrs-ias-cheat-sheet.md | 27 | IFRS 18 replaces IAS 1 for periods beginning on or after 1 January 2027 | date | intl.ifrs18.effective | ifrs.org |
| docs/standards/aasb-standards-overview.md | 24 | Presentation and disclosure (replaces AASB 101 from 2027) | date | au.aasb18.effective | aasb.gov.au |
| docs/standards/uk-gaap-frs102-vs-ifrs.md | 73 | period beginning on or after 1 January 2026 | date | (same as uk.frs102.periodicReview2024Effective) | frc.org.uk |
| docs/uk/companies-act-2006.md | 43 | shareholders holding 10% or more can still demand an audit | threshold | uk.ca.auditRequestHoldingPct | legislation.gov.uk |
| docs/uk/companies-act-2006.md | 50 | 21 months from incorporation, or 3 months from the ARD if later | deadline | uk.ch.firstAccountsMonths | gov.uk |
| docs/uk/companies-act-2006.md | 51 | Confirmation statement: at least once every 12 months, within 14 days | deadline | uk.ch.confirmationStatementDays | gov.uk |
| docs/uk/companies-act-2006.md | 52 | Corporation tax return (CT600): 12 months after the end of the accounting period | deadline | uk.ct.returnMonths | gov.uk |
| docs/uk/companies-act-2006.md | 53 | Corporation tax payment (small companies): 9 months and 1 day | deadline | uk.ct.paymentMonths | gov.uk |
| docs/uk/companies-act-2006.md | 55 | Late accounts attract automatic penalties, starting at £150 | penalty | uk.ch.latePenaltyPrivateMin | gov.uk |
| docs/uk/companies-act-2006.md | 76 | tell Companies House about changes within 14 days | deadline | uk.ch.pscChangeDays | gov.uk |
| docs/uk/companies-act-2006.md | 80 | existing PSCs have a 14-day window set by Companies House | deadline | uk.ch.idVerificationPscDays | gov.uk |
| docs/uk/companies-act-2006.md | 94 | pre-April 2025 thresholds (small turnover £10.2m, balance sheet £5.1m) | threshold | uk.ca.smallTurnoverPre2025, uk.ca.smallBalanceSheetPre2025 | legislation.gov.uk |
| docs/uk/companies-act-2006.md | 15 | For periods beginning on or after 6 April 2025 | date | uk.ca.sizeThresholdsEffective | legislation.gov.uk |
| docs/uk/mtd-vat-guide.md | 29 | expect it to in the next 30 days alone | threshold | uk.vat.registrationForwardLookDays | gov.uk |
| docs/uk/mtd-vat-guide.md | 51 | enough points trigger a £200 penalty | penalty | uk.vat.latePointsPenalty | gov.uk |
| docs/uk/mtd-vat-guide.md | 19 | Zero-rated 0% | rate | uk.vat.zeroRate | gov.uk |
| docs/uk/paye-cis-overview.md | 20 | paid to HMRC by the 22nd of the following month electronically (19th by post) | deadline | uk.paye.paymentDayElectronic, uk.paye.paymentDayPost | gov.uk |
| docs/uk/paye-cis-overview.md | 22 | give each employee a P60 by 31 May | deadline | uk.paye.p60Deadline | gov.uk |
| docs/uk/paye-cis-overview.md | 22 | report benefits in kind on P11D forms (unless payrolled) by 6 July | deadline | uk.paye.p11dDeadline | gov.uk |
| docs/uk/paye-cis-overview.md | 33 | Lower rates (0% up to an upper threshold) apply to employees under 21, apprentices under 25 | rate | uk.nic.employerReliefAges | gov.uk |
| docs/uk/paye-cis-overview.md | 39 | workers aged 22 to State Pension age | threshold | uk.pensions.autoEnrolMinAge | thepensionsregulator.gov.uk |
| docs/uk/paye-cis-overview.md | 39 | at least 8% of qualifying earnings, of which the employer pays at least 3% | rate | uk.pensions.minTotalContribution, uk.pensions.minEmployerContribution | thepensionsregulator.gov.uk |
| docs/uk/paye-cis-overview.md | 43 | monthly secondary threshold of £417 | threshold | uk.nic.secondaryThresholdMonthly | gov.uk |
| docs/uk/paye-cis-overview.md | 43 | (£3,000 − £417) × 15% = £387.45 | example |  | gov.uk |
| docs/uk/paye-cis-overview.md | 66 | File a monthly CIS return by the 19th | deadline | uk.cis.returnDay | gov.uk |
| docs/uk/paye-cis-overview.md | 65 | 0% for a subcontractor with gross payment status | rate | uk.cis.grossRate | gov.uk |
| docs/uk/paye-cis-overview.md | 76 | CIS Deductions Payable (20% × 2,000) 400 | example |  | gov.uk |
| docs/uk/xero-qbo-uk-setup.md | 16 | tax year ends on 5 April | date | uk.tax.yearEnd | gov.uk |
| docs/uk/xero-qbo-uk-setup.md | 16 | basis period reform moved everyone onto tax-year basis from 2024–25 | date | uk.tax.basisPeriodReformFrom | gov.uk |
| docs/australia/xero-qbo-au-setup.md | 16 | Financial year end: 30 June | date | au.tax.yearEnd | ato.gov.au |
| docs/australia/bas-gst-guide.md | 17 | 1,000 → GST 100, total 1,100 | example |  |  |
| docs/core-accounting/accounting-policies-templates.md | 54 | A 3,000 computer ... At 40% reducing balance: 1,200, then 720, then 432 | example |  |  |
| docs/core-accounting/accounting-policies-templates.md | 63 | items under 1,000 are expensed | example |  |  |
| docs/standards/ifrs-ias-cheat-sheet.md | 76 | licence plus 12 months' support for 12,000 ... 8,000 ... 4,000 | example |  |  |
| docs/core-accounting/month-end-close-checklist.md | 47 | March electricity bill (estimated at 330 including tax) | example |  |  |

Rows: 53 (deadline 16, penalty 2, threshold 10, rate 4, date 14, example 7)
