# Legal and provider sources (Stage 3 launch gate)

What each official source says, as read on the date given, for drafting the privacy notice, terms, data processing terms and sub-processor list. **This is a record of sources, not legal advice.** Anything under "Not checked" must not be stated as fact in a draft; a draft that needs it says "to be confirmed" instead.

## Anthropic (chat provider)

| Point | What the source says | Source | Read |
|---|---|---|---|
| Where inference runs | `inference_geo` takes `"global"` (default: "Inference may run in any available geography") or `"us"` ("Inference runs only in US-based infrastructure"). Supported on Claude 4.6 and later. | [Data residency](https://platform.claude.com/docs/en/manage-claude/data-residency) | 2026-10-31 |
| Where data is stored at rest | "Workspace geo ... Currently, `"us"` is the only available workspace geo." No Australian, UK or EU option on the first-party API. | same | 2026-10-31 |
| Price of US-only inference | "US-only inference (`inference_geo: "us"`) is priced at 1.1x the standard rate across all token pricing categories" on Claude 4.6 and later. | same | 2026-10-31 |
| Workspace controls | `allowed_inference_geos` and `default_inference_geo` can be set in the Console. | same | 2026-10-31 |
| Retention | "Conversation content (your prompts and Claude's outputs) is not retained by default; the exception is Covered Models" (Fable 5.1, Mythos 5.1, Fable 5, Mythos 5 require 30-day retention). Flagged content and legal holds are retained regardless. | [API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention) | 2026-10-31 |
| Training | "Retained data is never used for model training without your express permission." Commercial Terms: "Anthropic may not train models on Customer Content from Services." | same; [Commercial Terms](https://www.anthropic.com/legal/commercial-terms) (effective Jun 17, 2025) | 2026-10-31 |
| Ownership | "Customer (a) retains all rights to its Inputs, and (b) owns its Outputs." | Commercial Terms | 2026-10-31 |
| DPA | Data is processed under the Data Processing Addendum, "which is incorporated into these Terms by reference." | Commercial Terms | 2026-10-31 |

## Google (embeddings; optional chat provider)

| Point | What the source says | Source | Read |
|---|---|---|---|
| Paid use of prompts | Paid Services: "Google doesn't use your prompts" or "responses to improve our products." | [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) (last updated 2026-04-28) | 2026-10-31 |
| Logging | "Google logs prompts and responses for a limited period of time," for Prohibited Use Policy enforcement and legal disclosure. No duration given. | same | 2026-10-31 |
| Location | "This data may be stored transiently or cached in any country in which Google or its agents maintain facilities." | same | 2026-10-31 |
| DPA | Paid prompts and responses are processed under the Data Processing Addendum for Products Where Google is a Data Processor. | same | 2026-10-31 |
| UK, EEA, Switzerland | Paid-service terms apply to all Services there, and "paid Services are required when making API clients available to users in those regions." | same | 2026-10-31 |
| Unpaid use | Google may use inputs and outputs to improve products; human reviewers may read them. **The app must never run on unpaid Gemini quota with real data.** | same | 2026-10-31 |

## Australia (OAIC)

| Point | What the source says | Source | Read |
|---|---|---|---|
| APP 8.1 | Before disclosing personal information overseas, an entity "must take such steps as are reasonable in the circumstances" (para 8.2). | [APP guidelines chapter 8](https://www.oaic.gov.au/privacy/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information/) | 2026-10-31 |
| s 16C | The entity "is accountable for an act or practice of the overseas recipient that would breach the APPs" (para 8.2). | same | 2026-10-31 |
| Use or disclosure | Routing information through overseas servers in transit "would usually be considered a 'use'" (8.10). Giving it to an overseas contractor can be a use, not a disclosure, where the entity does not release it "from its effective control", including where "the contract gives the entity effective control of how the personal information is handled" (8.14). | same | 2026-10-31 |
| Consent exception | APP 8.2 exception 3: the entity "expressly informs the individual" and "the individual then consents" (8.31); the statement explains "the entity will not be accountable under the Privacy Act" (8.32). | same | 2026-10-31 |
| Who is covered | "organisations with an annual turnover more than $3 million have responsibilities under the Privacy Act"; smaller businesses are generally exempt, with exceptions (health service providers, businesses that trade in personal information, businesses that opt in, related businesses, and others). | [Rights and responsibilities](https://www.oaic.gov.au/privacy/privacy-legislation/the-privacy-act/rights-and-responsibilities) | 2026-10-31 |

## United Kingdom (ICO)

| Point | What the source says | Source | Read |
|---|---|---|---|
| Article 28 details | The contract covers the subject matter and duration, the nature and purpose, the type of personal data and categories of data subject, and the controller's obligations and rights. | [What needs to be included in the contract](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/contracts-and-liabilities-between-controllers-and-processors-multi/what-needs-to-be-included-in-the-contract/) | 2026-10-31 |
| Article 28 terms | Documented instructions (including on international transfers); confidentiality; Article 32 security; sub-processors only with written authorisation, notice of changes so the controller can object, equal obligations flowed down, processor stays liable; help with data subject rights; help with security, breach notification, DPIAs and prior consultation; delete or return at the end; information and audits. | same | 2026-10-31 |
| Transfers | Mechanisms include the IDTA and the Addendum to the EU SCCs; "If you rely on a safeguard, you must also ensure that you have completed a transfer risk assessment (TRA)"; the rules apply "regardless of whether you're a controller, a processor or a sub-processor" when you initiate a restricted transfer. | [International transfers: a guide](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/international-transfers-a-guide/) | 2026-10-31 |
| Fee | "organisations (including sole traders) that use personal information need to pay a data protection fee", "unless they are exempt". | [Data protection fee](https://ico.org.uk/for-organisations/data-protection-fee/) | 2026-10-31 |

## Not checked (say "to be confirmed" in any draft)

- Whether Anthropic and Google are certified under the EU-US Data Privacy Framework with the UK Extension (the UK-US data bridge), and so whether a UK transfer to them can rely on it. The ICO guide read above does not cover the data bridge.
- Which transfer mechanism Anthropic's DPA uses for UK and Australian data (SCCs, UK Addendum, IDTA); the Commercial Terms page did not say.
- Anthropic's and Google's sub-processor lists.
- Whether the data protection fee applies to a processor, and its tier and amount.
- The Notifiable Data Breaches scheme (AU) and UK breach-reporting deadlines: not read in this session.
- What APP 1 requires a privacy policy to contain: not read in this session.
- Whether the small business exemption applies to the operator of this service, or to the firms using it (registered tax agents in particular).
