# Privacy notice

Version: 2026-10-31-draft · Region: Australia

This notice describes how this service handles personal information. It is a draft written from the code and from recorded official sources, and a lawyer has not reviewed it.

## Who we are

The service is operated by [Owner: legal name of the business] (ABN [Owner: ABN]). You can write to us at [Owner: contact email] or [Owner: postal address].

We aim to follow the Australian Privacy Principles (APPs) for all personal information we handle. The Office of the Australian Information Commissioner (OAIC) says that organisations with an annual turnover of more than $3 million have responsibilities under the Privacy Act and that smaller businesses are generally exempt, with exceptions. [To be confirmed: whether the Privacy Act applies to us directly; we follow the APPs either way.]

This notice is for the people who use the service: accountants and bookkeepers and their staff, and the client contacts who receive an upload link from a firm.

## What we collect

- **Your account:** your name, email address and a password (stored hashed by our sign-in system), the workspaces you belong to and your role in each, and the legal version you accepted at sign-up and the time you accepted it.
- **Your firm's records:** the clients you list, their profile details (entity type, tax registration, tax period, financial year end, dates and similar), engagements and tasks, document requests, and the trial balances you import (the figures and account names, not the file itself).
- **Documents:** files you upload (PDF, Word, Excel, CSV, text and Markdown) and the text we extract from them. A client contact who uses an upload link can also send files; we show them only the firm's name, the link's expiry and the names of the requested items.
- **Conversations:** the questions you ask the assistant, its answers and the sources it cited.
- **Security and usage records:** a sign-in session record that includes the IP address and browser details as sent by your browser, an audit log of key actions in your workspace, counters that limit how often an action can be repeated, and a record of each call to an AI provider (the model, token counts and cost, with no text).

We do not use analytics or third-party tracking.

## How we use it

We use this information to run the service: to sign you in, to hold your firm's records, to produce reports from imported trial balances, to send email you need (sign-up confirmation, password reset, invitations and document requests and reminders), to answer your questions with the assistant, to limit abuse and to keep an audit trail. We do not sell personal information.

## Where it is stored

The database and its backups are in Australia ([Owner: hosting provider and region]). Uploaded files, the text extracted from them, each conversation's redaction map and the stored upload-link tokens are encrypted at rest with AES-256-GCM under a key held by the service. The stored text of your own questions in a conversation is not separately encrypted at the application level. [To be confirmed: whether the hosting provider also encrypts disks and backups.]

Email is sent through [Owner: email provider and region].

## The AI assistant

When you ask a question, or attach a document to a chat, we first replace some personal details with placeholders such as `[EMAIL_1]`. The kinds we replace are: your firm's client names (also without Pty Ltd, Ltd or Limited), email addresses, IBANs, card numbers, bank account numbers (BSB and account, or sort code and account), phone numbers, ABNs, UTRs, TFNs and ACNs, and National Insurance numbers. Where a number looks like one of these, we replace it even if it is something else.

**Other names are not replaced.** The names of staff, directors, suppliers and customers that are not in your client list reach the AI as written. Please remove them from files and questions if they must not leave this service.

The redacted question, the redacted text of any document you attached, and extracts from our knowledge base go to Anthropic, which produces the answer. If the question concerns your imported books, the assistant is also given a profit and loss and a balance sheet built from them; the account names are redacted in the same way, but the amounts are sent as figures. Answers are stored with the placeholders and the real values are put back only when a member of your firm reads them.

We also send text to Google to turn it into numeric vectors (embeddings) for search: knowledge-base text, and your redacted questions. Your uploaded documents are never embedded. If we are configured to use Google for chat answers, redacted questions and document text go to Google instead of Anthropic; [Owner: state which chat provider is in use].

What the providers say, as read on 31 October 2026:

- Anthropic: conversation content is not retained by default, except for flagged content, legal holds, and for certain "Covered Models" that require 30-day retention. [To be confirmed: whether the model we use is a Covered Model.] Anthropic's Commercial Terms say it may not train models on Customer Content, and the customer owns its outputs.
- Google (paid Gemini API): Google does not use paid prompts or responses to improve its products, but it logs prompts and responses for a limited period for abuse enforcement and legal disclosure. No duration is given on the page we read.

The assistant is not a person and does not give advice. See the terms of service.

## Sending information overseas

Anthropic is instructed to run inference only in United States infrastructure. Anthropic's documentation says the only workspace location currently available on its first-party API is the United States. Google says data sent to its Gemini API may be stored transiently or cached in any country in which Google or its agents maintain facilities.

Under APP 8.1, before disclosing personal information overseas an entity must take such steps as are reasonable in the circumstances, and under section 16C it is accountable for an act or practice of the overseas recipient that would breach the APPs. We handle this by sending only redacted text, by using paid provider terms with data processing addenda, and by the commitments in our data processing terms. [To be confirmed: which transfer mechanism Anthropic's and Google's data processing terms use for Australian data.] [To be confirmed: whether routing through a provider is a use or a disclosure for our purposes.]

## How long we keep it

Each firm sets how long documents (counted from upload) and conversations (counted from the last message) are kept: from 30 to 3650 days, or until deleted. A new workspace keeps everything until you delete it or change the setting. A background job removes expired items. The audit log is kept with the workspace and is removed when the workspace is deleted. Rate-limit counters are removed after a day. Backups keep copies of deleted items until a backup expires. [Owner: backup retention period.]

IP addresses in the rate-limit counters and the audit log are stored only as a keyed hash, not as the address. The sign-in session record is different: Better Auth's session table stores the raw IP address, and we have not removed it.

## Security

Beyond the encryption above: every firm's records are isolated in the database by row-level security, passwords are hashed, access to the platform's administration area is restricted to one administrator, sign-in and other actions are rate limited, and logs do not contain message bodies or uploaded text. No system is perfectly secure. [To be confirmed: any certification or external security review.]

## Your choices and rights

You can ask us for access to the personal information we hold about you, and to correct it. A firm member can delete documents, conversations and imports in the service. For personal information about a firm's own clients, please contact the firm first, as it decides what it holds. Write to [Owner: contact email].

## Contact and complaints

Contact us at [Owner: contact email]. If you are not satisfied with our response, you can complain to the OAIC at oaic.gov.au.
