# Data processing terms

Version: 2026-10-31-draft · Region: Australia

These terms are a draft. A lawyer has not reviewed them and they are not yet in force. They apply when a firm uses the service to handle information about its clients.

## Roles

The firm decides why and how its clients' personal information is handled and is responsible for it under the Privacy Act 1988 and the Australian Privacy Principles (APPs). We handle that information only to provide the service to the firm, on the firm's instructions given through its use of the service. [To be confirmed: whether the Privacy Act applies directly to the firm and to us; the OAIC says smaller businesses are generally exempt, with exceptions, and registered tax agents have not been checked.]

## What we process

- **Information:** client names and profile details, imported trial-balance figures and account names, uploaded documents and the text extracted from them, document requests, engagements and tasks, conversations with the assistant, and the contact email addresses of people who receive an upload link.
- **Why:** to store the records, produce reports, take uploads from the firm's clients, send reminders and answer the firm's questions.
- **How long:** while the workspace exists, or for the retention period the firm sets for documents and conversations (30 to 3650 days). The firm can delete items at any time.

## Our commitments

We will:

- handle the information only to provide the service and not sell it;
- keep uploaded documents, their extracted text, conversation redaction maps and stored upload-link tokens encrypted at rest, and keep each firm's records isolated in the database;
- replace the firm's client names, email addresses, bank and card numbers, phone numbers and tax identifiers with placeholders before text goes to an AI provider, noting that names not in the client list (staff, directors, suppliers, customers) are not replaced;
- keep an audit log of key actions that the firm's owners and admins can read;
- keep message bodies and uploaded text out of our logs;
- limit access to the information to people who need it to run the service. [To be confirmed: staff access controls and confidentiality undertakings.]

## Sub-processors

We use the sub-processors listed on the sub-processors page, and will tell firms before we add or replace one ([Owner: notice period]). [To be confirmed: Anthropic's and Google's own sub-processor lists.]

## Overseas disclosure

Chat questions and attached document text, after redaction, go to Anthropic with inference pinned to the United States. Anthropic's documentation says the only workspace location currently available on its first-party API is the United States. Knowledge-base text and redacted questions go to Google for embeddings, and Google says data may be stored transiently or cached in any country in which it maintains facilities. Conversation content is not retained by Anthropic by default, with exceptions (flagged content, legal holds and certain models), and Anthropic's Commercial Terms say it may not train models on Customer Content.

The OAIC says that before disclosing personal information overseas an entity "must take such steps as are reasonable in the circumstances" (APP 8.1) and that the entity "is accountable for an act or practice of the overseas recipient that would breach the APPs" (s 16C). These are the firm's obligations for its clients' information, and the firm should decide whether our safeguards are reasonable for it. The OAIC also describes an exception where the firm expressly informs the individual and the individual then consents, in which case the entity is not accountable under the Privacy Act; the firm decides whether to rely on it. The OAIC says that giving information to an overseas contractor can be a use rather than a disclosure where the entity keeps effective control of how it is handled; [To be confirmed: whether that applies here.] [To be confirmed: the transfer mechanism in Anthropic's and Google's data processing terms for Australian data.]

## Security incidents

[To be confirmed: Notifiable Data Breaches scheme obligations]

We will tell the firm without undue delay if we become aware of unauthorised access to its information. [Owner: confirm this commitment and its timing.]

## When the service ends

When a workspace is deleted, its records, documents, conversations and audit log are deleted from the database; copies remain in backups until those expire ([Owner: backup retention period]). Before then the firm can export what it needs. [Owner: export arrangements.]
