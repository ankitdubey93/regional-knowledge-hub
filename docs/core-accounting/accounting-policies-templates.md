---
title: Essential accounting policies
summary: Revenue recognition, inventory (FIFO and weighted average), depreciation, bad debts, accruals and prepayments, with policy wording you can adapt.
jurisdiction: INTL
level: beginner
order: 2
facts: [au.depreciation.instantAssetWriteOff]
tools: [inventory, depreciation, journal]
---

An **accounting policy** is a choice a business makes about how to apply the standards to its own transactions, written down so that it is applied the same way each period. A small business's policies are often one paragraph each in the notes to the accounts. The templates below are starting points; adapt them to the client and the framework (IFRS, FRS 102, FRS 105, AASB).

## Revenue recognition

Revenue is recognised when the business has done what it promised, either **at a point in time** (a shop sale, a delivered product) or **over time** (a monthly service, a building contract).

- Sale of goods: usually when control passes to the customer, often on delivery.
- Services: as the service is performed. A 12-month subscription billed upfront is revenue at 1/12 a month; the rest sits in **Deferred Revenue** (a liability).
- Bundles: a sale of hardware plus a year of support is two promises. The price is split between them and each is recognised when it is delivered.

> **Template.** Revenue is measured at the fair value of the consideration received or receivable, net of discounts and of GST/VAT. Revenue from the sale of goods is recognised when control passes to the customer, generally on delivery. Revenue from services is recognised over the period in which the services are performed.

Under IFRS 15 and AASB 15, and under FRS 102 from 2026, this follows the five-step model (see the Standards section).

## Inventory valuation

Inventory is measured at the **lower of cost and net realisable value (NRV)**. Cost includes the purchase price, import duties and freight in, less trade discounts. NRV is the expected selling price less the costs to complete and sell.

Two cost formulas are allowed for interchangeable items:

- **FIFO (first in, first out)**: the oldest stock is assumed to be sold first. Closing stock is valued at the most recent prices.
- **Weighted average cost (WAC)**: each unit carries the average cost of everything on hand. In a perpetual system the average is recalculated after every purchase.

**LIFO (last in, first out) is not allowed** under IFRS, FRS 102, FRS 105 or AASB.

When prices are rising, FIFO gives a lower cost of sales and higher profit than WAC, and a higher closing stock value. Try it in the **Inventory** tool.

When stock is damaged, obsolete or selling below cost, write it down to NRV:

| Account | Debit | Credit |
|---|---|---|
| Inventory Write-down (expense) | 400 | |
| Inventory | | 400 |

> **Template.** Inventories are stated at the lower of cost and net realisable value. Cost is determined on a first-in, first-out [or weighted average] basis and includes all costs of purchase and of bringing inventories to their present location and condition.

## Depreciation and amortisation

Depreciation spreads the cost of a tangible asset over its **useful life**; amortisation does the same for an intangible asset.

- **Straight line**: (cost − residual value) ÷ useful life, the same charge every year.
- **Reducing (diminishing) balance**: a fixed percentage of the opening carrying amount each year, so the charge is higher in early years.

A 3,000 computer with no residual value and a 3-year life: straight line is 1,000 a year. At 40% reducing balance: 1,200, then 720, then 432.

| Account | Debit | Credit |
|---|---|---|
| Depreciation (expense) | 1,000 | |
| Accumulated Depreciation – Computer Equipment | | 1,000 |

Accumulated depreciation is a **contra-asset**: it sits with the assets but carries a credit balance. Cost less accumulated depreciation is the **carrying amount** (net book value).

**Capitalisation threshold.** A policy such as "items under 1,000 are expensed" is a materiality choice. It is not the same as a tax rule. In Australia the instant asset write-off ({{fact:au.depreciation.instantAssetWriteOff}}) is a **tax** deduction; the financial statements still follow the accounting policy. In the UK, capital allowances play that role for tax and accounting depreciation is added back.

> **Template.** Property, plant and equipment is stated at cost less accumulated depreciation and impairment. Depreciation is charged so as to allocate the cost of assets less their residual value over their estimated useful lives, using the straight-line method: computer equipment 3 years, office equipment 5 years, motor vehicles 5 years.

## Bad and doubtful debts

- **Direct write-off**: when a specific debt is definitely lost, remove it: debit Bad Debts, credit Accounts Receivable.
- **Allowance (provision) method**: at each period end, estimate how much of the receivables will not be collected and hold an **Allowance for Credit Losses** (a contra-asset). IFRS 9 and AASB 9 call this the expected credit loss model; FRS 102 uses an incurred-loss approach.

Raising an allowance of 600:

| Account | Debit | Credit |
|---|---|---|
| Bad Debts (expense) | 600 | |
| Allowance for Credit Losses | | 600 |

Writing off a 200 debt already covered by the allowance:

| Account | Debit | Credit |
|---|---|---|
| Allowance for Credit Losses | 200 | |
| Accounts Receivable | | 200 |

In Australia, GST already paid on a bad debt can be claimed back as a decreasing adjustment once it is written off (rules apply). In the UK, VAT bad debt relief is available once the debt is more than six months overdue and written off.

## Accruals and prepayments

| Situation | What it is | Entry at month end |
|---|---|---|
| Expense incurred, no bill yet | **Accrual** (liability) | Dr Expense, Cr Accrued Expenses |
| Expense paid in advance | **Prepayment** (asset) | On payment: Dr Prepayments. Each month: Dr Expense, Cr Prepayments |
| Income earned, not invoiced | **Accrued income** (asset) | Dr Accrued Income, Cr Revenue |
| Income invoiced in advance | **Deferred revenue** (liability) | Dr Revenue (or on invoice: Cr Deferred Revenue), release monthly |

**Reversing journals.** An accrual posted on 31 March is reversed on 1 April. When the real bill arrives in April and is coded to the expense as normal, the reversal cancels it out, so the expense is counted once, in March.

## Common mistakes

- Expensing a 12-month insurance policy in the month it is paid.
- Forgetting to reverse an accrual, so the expense lands twice.
- Using the tax write-off limit as the accounting capitalisation policy without saying so.
- Valuing stock at selling price rather than cost.

## Practise

Use the **Depreciation** and **Inventory** tools, and the prepayment, accrual and bad-debt scenarios in the **Journal simulator**.

## Sources

- [IAS 2 Inventories](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/)
- [IAS 16 Property, Plant and Equipment](https://www.ifrs.org/issued-standards/list-of-standards/ias-16-property-plant-and-equipment/)
- [ATO: GST and bad debts](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst)
- [HMRC: VAT bad debt relief](https://www.gov.uk/vat-businesses/bad-debt-relief)

Figures shown as badges come from the facts registry and carry their own source and check date. Other figures in the text (deadlines, examples) have not each been checked against a source: confirm them at the links above before relying on them.
