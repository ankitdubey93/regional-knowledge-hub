# Content rules

These rules exist because the reader is learning, cannot yet tell a wrong figure from a right one, and will repeat what the site says to a client.

## Sources, in order of trust

| Jurisdiction | Use | Do not use as the source |
|---|---|---|
| Australia | ato.gov.au, asic.gov.au, aasb.gov.au, legislation.gov.au, acnc.gov.au | Accounting firm blogs, software vendor help pages, forums |
| United Kingdom | gov.uk (HMRC, Companies House), legislation.gov.uk, frc.org.uk, thepensionsregulator.gov.uk | Same as above |
| International | ifrs.org | Summaries by firms |

A software help centre (Xero Central, QuickBooks support) is a fine source for **software behaviour and names**, never for tax law.

## Figures

- A figure that changes over time (a rate, threshold, cap, limit, effective date) is a fact in the `kb_fact` table, edited at `/admin/facts` (a fact edited there is the source of truth) and written in a doc as `{{fact:key}}`. `shared/seed/facts.json` only seeds an empty or seed-owned database: an edit to it does not reach a database where an admin has changed that fact.
- Fact keys: `<jurisdiction>.<area>.<name>`, e.g. `au.gst.rate`, `uk.ca.smallTurnover`, `intl.ifrs16.shortTermMonths`.
- Units: `bp` (basis points, 10% = 1000), `cents` (cents or pence), `count`, `date` (`yyyy-mm-dd`), `text`.
- `verifiedOn` is the date **you** read the figure on the official page. Not the date you wrote the entry, not the date someone else checked it. If you could not confirm it, `null`.
- Worked examples (1,100 → GST 100) may use plain numbers, but they must agree with the facts.

## Shape of a doc

1. Frontmatter (see `architecture.md`).
2. An opening paragraph that says what the thing is and who administers it.
3. Plain-English explanation with tables where a comparison helps.
4. Worked journal entries as Markdown tables (Account | Debit | Credit).
5. **AU vs UK** table when the topic exists in both countries.
6. **Common mistakes**: real beginner errors, the kind a reviewer would catch.
7. **In Xero / QBO** where relevant.
8. **Practise**: which tools to use.
9. **Sources**: links to the official pages, then the standard sentence about unchecked text figures.

## Style

- Short sentences. Define a term the first time (bold it).
- Say "must" only for legal requirements; "usually" or "most" when there are exceptions you are not listing.
- Name the year a rule changed when it changed recently (Payday Super from 1 July 2026; FRS 102 leases from 1 January 2026).
- Never write "always" or "never" about tax unless the law says so.
- Hedge honestly: "check the current text" is better than a confident guess.

## Exercises

- Each quiz question has 3 to 5 options; **every option has a `why`** that teaches something, including the right one.
- Wrong options are real mistakes (the old rate, the other country's rule, the confused label), not jokes.
- Journal scenarios use only accounts from `chart-of-accounts.json` for their jurisdiction and must balance (the test checks).
- Coding scenarios name the document's source, a realistic supplier and a date; `alsoAccepted` lists defensible alternatives that firms really use, and the explanation says so.
