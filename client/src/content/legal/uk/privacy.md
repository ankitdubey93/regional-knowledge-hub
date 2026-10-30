# Privacy notice

Version: 2026-10-31-draft · Region: the United Kingdom

This notice describes how this service handles personal data. It is a draft written from the code and from recorded official sources, and a lawyer has not reviewed it.

## Who we are

The service is operated by [Owner: legal name of the business], [Owner: company number or trading status], of [Owner: postal address]. You can write to us at [Owner: contact email]. [To be confirmed: whether we pay a data protection fee to the ICO; the ICO says organisations that use personal information need to pay the fee unless they are exempt, and whether it applies to a processor has not been checked.]

This notice is for the people who use the service: accountants and bookkeepers and their staff, and the client contacts who receive an upload link from a firm. We handle that data under the UK GDPR and the Data Protection Act 2018. For the account holders themselves we act as controller. For a firm's clients' data we act as the firm's processor (see our data processing terms). [To be confirmed: the lawful basis we rely on for each use below.]

## What we collect

- **Your account:** your name, email address and a password (stored hashed by our sign-in system), the workspaces you belong to and your role in each, and the legal version you accepted at sign-up and the time you accepted it.
- **Your firm's records:** the clients you list, their profile details (entity type, tax registration, tax period, financial year end, dates and similar), engagements and tasks, document requests, and the trial balances you import (the figures and account names, not the file itself).
- **Documents:** files you upload (PDF, Word, Excel, CSV, text and Markdown) and the text we extract from them. A client contact who uses an upload link can also send files; we show them only the firm's name, the link's expiry and the names of the requested items.
- **Conversations:** the questions you ask the assistant, its answers and the sources it cited.
- **Security and usage records:** a sign-in session record that includes the IP address and browser details as sent by your browser, an audit log of key actions in your workspace, counters that limit how often an action can be repeated, and a record of each call to an AI provider (the model, token counts and cost, with no text).

We do not use analytics or third-party tracking.

## How we use it

We use this data to run the service: to sign you in, to hold your firm's records, to produce reports from imported trial balances, to send email you need (sign-up confirmation, password reset, invitations and document requests and reminders), to answer your questions with the assistant, to limit abuse and to keep an audit trail. We do not sell personal data.

## Where it is stored

The database and its backups are in the United Kingdom ([Owner: hosting provider and region]). Uploaded files, the text extracted from them, each conversation's redaction map and the stored upload-link tokens are encrypted at rest with AES-256-GCM under a key held by the service. The stored text of your own questions in a conversation is not separately encrypted at the application level. [To be confirmed: whether the hosting provider also encrypts disks and backups.]

Email is sent through [Owner: email provider and region].

## The AI assistant

When you ask a question, or attach a document to a chat, we first replace some personal details with placeholders such as `[EMAIL_1]`. The kinds we replace are: your firm's client names (also without Ltd, Limited or Pty Ltd), email addresses, IBANs, card numbers, bank account numbers (sort code and account, or BSB and account), phone numbers, UTRs, National Insurance numbers, and Australian ABNs, TFNs and ACNs. Where a number looks like one of these, we replace it even if it is something else.

**Other names are not replaced.** The names of staff, directors, suppliers and customers that are not in your client list reach the AI as written. Please remove them from files and questions if they must not leave this service.

The redacted question, the redacted text of any document you attached, and extracts from our knowledge base go to Anthropic, which produces the answer. If the question concerns your imported books, the assistant is also given a profit and loss and a balance sheet built from them; the account names are redacted in the same way, but the amounts are sent as figures. Answers are stored with the placeholders and the real values are put back only when a member of your firm reads them.

We also send text to Google to turn it into numeric vectors (embeddings) for search: knowledge-base text, and your redacted questions. Your uploaded documents are never embedded. If we are configured to use Google for chat answers, redacted questions and document text go to Google instead of Anthropic; [Owner: state which chat provider is in use].

What the providers say, as read on 31 October 2026:

- Anthropic: conversation content is not retained by default, except for flagged content, legal holds, and for certain "Covered Models" that require 30-day retention. [To be confirmed: whether the model we use is a Covered Model.] Anthropic's Commercial Terms say it may not train models on Customer Content, and the customer owns its outputs.
- Google (paid Gemini API): Google does not use paid prompts or responses to improve its products, but it logs prompts and responses for a limited period for abuse enforcement and legal disclosure. No duration is given on the page we read. Google's terms require paid use of the Gemini API for users in the UK, and this service uses paid quota only.

The assistant is not a person and does not give advice. See the terms of service.

## Sending information overseas

Anthropic is instructed to run inference only in United States infrastructure, and its documentation says the only workspace location currently available on its first-party API is the United States. Google says data sent to its Gemini API may be stored transiently or cached in any country in which Google or its agents maintain facilities. Sending personal data to these providers is a restricted transfer under the UK GDPR. The ICO says that where a safeguard such as the International Data Transfer Agreement or the Addendum to the EU standard contractual clauses is relied on, a transfer risk assessment must also be completed. Our mechanism is [To be confirmed: transfer mechanism and whether the UK-US data bridge applies]. [To be confirmed: whether Anthropic and Google are certified under the data bridge.] [To be confirmed: the transfer risk assessment.]

## How long we keep it

Each firm sets how long documents (counted from upload) and conversations (counted from the last message) are kept: from 30 to 3650 days, or until deleted. A new workspace keeps everything until you delete it or change the setting. A background job removes expired items. The audit log is kept with the workspace and is removed when the workspace is deleted. Rate-limit counters are removed after a day. Backups keep copies of deleted items until a backup expires. [Owner: backup retention period.]

IP addresses in the rate-limit counters and the audit log are stored only as a keyed hash, not as the address. The sign-in session record is different: Better Auth's session table stores the raw IP address, and we have not removed it.

## Security

Beyond the encryption above: every firm's records are isolated in the database by row-level security, passwords are hashed, access to the platform's administration area is restricted to one administrator, sign-in and other actions are rate limited, and logs do not contain message bodies or uploaded text. No system is perfectly secure. [To be confirmed: any certification or external security review.]

## Your choices and rights

Under the UK GDPR you have the right of access, rectification, erasure, restriction of processing, data portability and objection, in the circumstances the law sets out. A firm member can delete documents, conversations and imports in the service. For personal data about a firm's own clients, please contact the firm first, as it decides what it holds. Write to [Owner: contact email].

## Contact and complaints

Contact us at [Owner: contact email]. If you are not satisfied with our response, you can complain to the Information Commissioner's Office (ICO) at ico.org.uk.
