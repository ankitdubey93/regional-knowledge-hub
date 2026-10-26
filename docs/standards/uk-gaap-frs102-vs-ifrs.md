---
title: UK GAAP: FRS 102, 101 and 105 vs IFRS
summary: Which UK framework a company uses, and the differences that change the bookkeeping, including the 2026 Periodic Review changes to leases and revenue.
jurisdiction: UK
level: intermediate
order: 2
facts: [uk.frs102.periodicReview2024Effective, uk.frs102.goodwillDefaultLife, uk.ca.microTurnover, uk.ca.microBalanceSheet, uk.ca.microEmployees]
tools: [compare, company-size]
---

The **Financial Reporting Council (FRC)** sets accounting standards in the UK and Republic of Ireland. Together they are called **UK GAAP**. Listed groups use UK-adopted IFRS for their consolidated accounts; almost everyone else uses one of these:

| Standard | Who uses it | In one line |
|---|---|---|
| **FRS 102** | Most private companies, LLPs, charities (with the Charities SORP) | IFRS-based, simplified, the default framework |
| **FRS 102 Section 1A** | Small companies | FRS 102 measurement, far fewer disclosures |
| **FRS 105** | Micro-entities that opt in | The simplest: cost-only, minimal notes |
| **FRS 101** | Subsidiaries (and parents' own accounts) in IFRS groups | IFRS measurement with reduced disclosures |

A company is a **micro-entity** if it meets two of: turnover not more than {{fact:uk.ca.microTurnover}}, balance sheet total not more than {{fact:uk.ca.microBalanceSheet}}, and not more than {{fact:uk.ca.microEmployees}} employees (see the Companies Act page for the full size rules).

## The 2026 changes (Periodic Review 2024)

The FRC's Periodic Review 2024 amendments take effect for periods beginning on or after **{{fact:uk.frs102.periodicReview2024Effective}}** (early adoption allowed). The two big ones:

- **Leases (Section 20).** Lessees bring most leases onto the balance sheet as a right-of-use asset and a lease liability, as under IFRS 16. Operating lease rentals no longer run straight through the P&L. Short-term and low-value leases can still be expensed.
- **Revenue (Section 23).** A five-step model based on IFRS 15 replaces the risks-and-rewards approach.

What a bookkeeper notices on a client file:

- New balance sheet lines: Right-of-Use Asset and Lease Liability.
- Rent for a property lease is no longer coded to *Rent* each month. Instead: depreciation on the ROU asset plus interest on the liability, with the payment reducing the liability.
- EBITDA rises (rent was an operating expense; depreciation and interest sit below EBITDA).
- In the cash flow statement, lease principal moves to financing activities.

## Differences from full IFRS that remain

| Topic | FRS 102 | IFRS |
|---|---|---|
| **Goodwill** | Amortised over its useful life; if that cannot be reliably estimated, {{fact:uk.frs102.goodwillDefaultLife}} | Not amortised; impairment test every year |
| **Development costs** | Policy choice: capitalise when criteria are met, or expense | Must capitalise when criteria are met (IAS 38) |
| **Borrowing costs** | Policy choice: capitalise or expense | Must capitalise on qualifying assets (IAS 23) |
| **Financial instruments** | Basic instruments at amortised cost; simpler rules | IFRS 9 in full, including expected credit losses |
| **Cash flow statement** | Not required for small companies (Section 1A) | Always required |
| **Deferred tax** | Timing-difference approach plus | Temporary-difference approach |

## FRS 105 in practice

- **No revaluation, no fair value**: everything at cost.
- No deferred tax, no recognition of internally generated intangibles.
- Development costs are expensed.
- A balance sheet and a profit and loss account, with a handful of notes. No cash flow statement.
- Accounts prepared under FRS 105 are presumed by law to give a true and fair view.

A micro-entity that holds investment property or wants to revalue its buildings cannot use FRS 105; it must use FRS 102.

## FRS 101

Used by a subsidiary of a group reporting under IFRS: the subsidiary's own accounts use IFRS recognition and measurement (so the numbers match the group pack) but skip many IFRS disclosures, such as a cash flow statement and some financial instruments disclosures, if the group accounts provide them.

## AU vs UK

| | Australia | United Kingdom |
|---|---|---|
| Standard-setter | AASB | FRC |
| Relationship to IFRS | For-profit standards are IFRS word for word | FRS 102 is IFRS-based but materially different |
| Goodwill | Not amortised (AASB 3/136) | Amortised under FRS 102 and FRS 105 |
| Small-company relief | Many small proprietary companies do not prepare general purpose financial statements at all | Small companies prepare accounts under Section 1A or FRS 105 and file them at Companies House |

## Common mistakes

- Assuming a UK subsidiary of an Australian group uses the same goodwill policy as its parent.
- Applying the pre-2026 lease rules to a period beginning on or after 1 January 2026.
- Revaluing property in an FRS 105 set of accounts.

## Practise

Open **Compare frameworks** and filter to *Changed in 2026*.

## Sources

- [FRC: FRS 102](https://www.frc.org.uk/library/standards-codes-policy/accounting-and-reporting/uk-accounting-standards/frs-102/)
- [FRC: Periodic Review 2024 explainer](https://www.frc.org.uk/docs/9461/html/)
- [FRC: FRS factsheets](https://www.frc.org.uk/library/standards-codes-policy/accounting-and-reporting/uk-accounting-standards/frs-factsheets/)

Figures shown as badges come from the facts registry and carry their own source and check date. Other figures in the text (deadlines, examples) have not each been checked against a source: confirm them at the links above before relying on them.
