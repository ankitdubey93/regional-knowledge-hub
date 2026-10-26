---
title: IFRS and IAS cheat sheet
summary: The six standards a bookkeeper meets most often (IAS 1, 2, 7, 16, IFRS 15, 16), what each one asks of you, and the journals behind them.
jurisdiction: INTL
level: intermediate
order: 1
facts: [intl.ifrs16.shortTermMonths]
tools: [compare, journal, inventory, depreciation]
---

**IFRS** (International Financial Reporting Standards) are issued by the **IASB**. Older standards issued before 2001 are still called **IAS** (International Accounting Standards) and remain in force until replaced. Australia adopts them almost word for word as AASB standards; UK listed groups use UK-adopted IFRS; UK private companies mostly use FRS 102, which is based on IFRS but simpler.

You do not need to read the standards cover to cover. You need to know which one governs the transaction in front of you.

## IAS 1: Presentation of financial statements

A complete set of financial statements is:

1. **Statement of financial position** (balance sheet)
2. **Statement of profit or loss and other comprehensive income**
3. **Statement of changes in equity**
4. **Statement of cash flows** (IAS 7)
5. **Notes**, including the accounting policies

Assets and liabilities are split into **current** (expected to be settled within 12 months or the normal operating cycle) and **non-current**. Comparative figures for the previous period are required.

**IFRS 18** replaces IAS 1 for periods beginning on or after 1 January 2027. It adds required subtotals in the profit or loss statement (operating profit, profit before financing and income taxes) and new disclosures for management-defined performance measures. The bookkeeping does not change; the presentation does.

## IAS 2: Inventories

- Measure at the **lower of cost and net realisable value**.
- Cost includes purchase price, import duties, transport in and handling, less discounts. It excludes selling costs, abnormal waste and storage (unless needed in production).
- Cost formulas: **FIFO** or **weighted average**. Specific identification for items that are not interchangeable (cars, jewellery). **LIFO is prohibited.**
- Write-downs to NRV go to profit or loss in the period; a write-down is reversed if NRV recovers, but never above original cost.

## IAS 7: Statement of cash flows

Cash flows are grouped into three activities:

| Activity | Examples |
|---|---|
| **Operating** | Receipts from customers, payments to suppliers and employees, income tax paid |
| **Investing** | Buying or selling equipment, property, investments |
| **Financing** | Proceeds from loans or share issues, loan repayments, lease principal, dividends paid |

The **indirect method** starts from profit and adjusts for non-cash items (depreciation) and working capital movements (an increase in receivables reduces cash). The **direct method** lists actual receipts and payments.

## IAS 16: Property, plant and equipment

- Recognise an item when future economic benefits are probable and cost can be measured reliably.
- Initial cost: purchase price, non-refundable taxes, costs to get it working (delivery, installation), and an estimate of dismantling costs. Recoverable GST or VAT is **not** part of cost.
- After recognition: **cost model** (cost less depreciation and impairment) or **revaluation model** (fair value), by class.
- **Component approach**: significant parts with different lives are depreciated separately (an aircraft's engines and airframe).
- Residual value, useful life and depreciation method are reviewed at least at each year end.
- On **disposal**, remove the cost and accumulated depreciation; the difference from proceeds is a gain or loss.

Disposing of equipment that cost 10,000 with 7,000 accumulated depreciation, sold for 2,500 (ignoring tax):

| Account | Debit | Credit |
|---|---|---|
| Bank | 2,500 | |
| Accumulated Depreciation | 7,000 | |
| Loss on Disposal | 500 | |
| Equipment (cost) | | 10,000 |

## IFRS 15: Revenue from contracts with customers

The **five-step model**:

1. **Identify the contract** with the customer (approved, rights and payment terms identifiable, has commercial substance, collection probable).
2. **Identify the performance obligations**: each distinct good or service promised.
3. **Determine the transaction price**, including variable consideration (discounts, rebates, bonuses) where it is highly probable not to reverse.
4. **Allocate the price** to each obligation by its standalone selling price.
5. **Recognise revenue** when (or as) each obligation is satisfied: at a point in time when control passes, or over time if the customer benefits as the work is done.

Example: a software firm sells a licence plus 12 months' support for 12,000. Standalone prices: licence 9,000, support 4,500. Allocate 8,000 to the licence (recognised at delivery) and 4,000 to support (recognised at 333.33 a month).

## IFRS 16: Leases (lessee)

A lessee recognises a **right-of-use (ROU) asset** and a **lease liability** for almost every lease.

- The lease liability is the present value of the lease payments, discounted at the rate implicit in the lease or the lessee's incremental borrowing rate.
- The ROU asset is the liability plus initial direct costs and payments made at or before the start.
- Each period: depreciate the ROU asset (usually straight line), and charge interest on the liability. Payments reduce the liability.
- **Exemptions** (optional): short-term leases, with a term of {{fact:intl.ifrs16.shortTermMonths}}, and leases of low-value assets. Those are expensed straight line.

At the start of a lease with a present value of 50,000:

| Account | Debit | Credit |
|---|---|---|
| Right-of-Use Asset | 50,000 | |
| Lease Liability | | 50,000 |

Lessors still classify leases as finance or operating.

## Related standards worth knowing by name

| Standard | Topic |
|---|---|
| IAS 8 | Accounting policies, changes in estimates and errors |
| IAS 10 | Events after the reporting period |
| IAS 12 | Income taxes (current and deferred tax) |
| IAS 19 | Employee benefits (leave, pensions) |
| IAS 36 | Impairment of assets |
| IAS 37 | Provisions and contingent liabilities |
| IAS 38 | Intangible assets |
| IFRS 9 | Financial instruments (including expected credit losses on receivables) |

## Common mistakes

- Including recoverable GST/VAT in the cost of an asset.
- Recognising a full year's subscription as revenue on the invoice date.
- Classifying lease principal repayments as operating cash flows under IFRS 16 (they are financing).
- Writing inventory up above cost when prices rise.

## Practise

Open **Compare frameworks** to see how each of these differs under FRS 102, FRS 105 and AASB.

## Sources

- [IFRS Foundation: list of standards](https://www.ifrs.org/issued-standards/list-of-standards/)
- [IFRS 18 Presentation and Disclosure](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-18-presentation-and-disclosure-in-financial-statements/)

Figures shown as badges come from the facts registry and carry their own source and check date. Other figures in the text (deadlines, examples) have not each been checked against a source: confirm them at the links above before relying on them.
