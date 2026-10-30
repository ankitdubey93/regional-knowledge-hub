# Data processing terms

Version: 2026-10-31-draft · Region: the United Kingdom

These terms are a draft of an Article 28 UK GDPR agreement. A lawyer has not reviewed them and they are not yet in force. They apply when a firm (the controller) uses the service (the processor) to handle personal data about its clients.

## Roles

The firm is the controller of its clients' personal data. We are the processor and act only on the firm's documented instructions, given through its use of the service and these terms.

## What we process

- **Subject matter and duration:** providing the service to the firm. We process the data while the workspace exists, or for the retention period the firm sets for documents and conversations (30 to 3650 days), and until it is deleted or returned at the end of the service.
- **Nature and purpose:** storing records, producing reports from imported trial balances, taking uploads from the firm's clients, sending reminders by email, and answering the firm's questions with an AI assistant after redaction.
- **Types of personal data:** client names and profile details, imported trial-balance figures and account names, uploaded documents and the text extracted from them (which may contain any personal data the firm or its client puts in them), the contact email addresses of people who receive an upload link, and conversations with the assistant.
- **Categories of data subject:** the firm's clients and their directors, employees, suppliers and customers, to the extent they appear in the data, and the firm's own staff.
- **The controller's obligations and rights:** the firm must have a lawful basis for the data it puts into the service, tell its clients how it uses processors, decide on retention, and answer data subject requests. It may give instructions, delete data, and audit us as set out below. [To be confirmed: the firm's obligations on international transfers.]

## Our commitments

We will:

1. process the personal data only on the firm's documented instructions, including on international transfers, unless the law requires otherwise, in which case we tell the firm first unless the law forbids it. Sending redacted text to Anthropic in the United States and to Google is a transfer the firm instructs by using the service. [To be confirmed: transfer mechanism and whether the UK-US data bridge applies.]
2. ensure that the people authorised to process the data are committed to confidentiality. [To be confirmed: staff confidentiality undertakings.]
3. take the security measures required by Article 32 UK GDPR, including encryption of uploaded documents, extracted text, redaction maps and stored upload-link tokens at rest, row-level isolation of each firm's records, redaction of client names and identifiers before text goes to an AI provider (names not in the client list are not replaced), an audit log, rate limits, and logs that hold no message bodies or uploaded text.
4. engage a sub-processor only with the firm's general written authorisation. The firm authorises the sub-processors on the sub-processors page. We will give the firm notice of any intended addition or replacement so that it can object, and if it objects and we cannot agree a solution, it may end the service. We will impose on each sub-processor the same data protection obligations as in these terms and remain fully liable to the firm for the sub-processor's performance. [Owner: notice period.] [To be confirmed: Anthropic's and Google's own sub-processor lists.]
5. help the firm respond to requests from individuals exercising their rights, by letting the firm search, export and delete its records, and by passing on any request we receive.
6. help the firm meet its obligations on the security of processing, the notification of personal data breaches, data protection impact assessments and prior consultation with the ICO. We will tell the firm without undue delay after becoming aware of a personal data breach affecting its data. [To be confirmed: UK breach-reporting deadlines and the form of our notification.]
7. delete or return all personal data to the firm at the end of the service, at the firm's choice, and delete existing copies unless the law requires storage. Copies in backups are removed when those backups expire ([Owner: backup retention period]).
8. make available to the firm all information necessary to show compliance with Article 28, and allow and contribute to audits and inspections by the firm or its auditor. [Owner: audit process and notice.]

## Sub-processors

The sub-processors are listed on the sub-processors page. Anthropic receives redacted questions, redacted attached-document text and knowledge-base extracts, with inference pinned to the United States; Google receives knowledge-base text and redacted questions for embeddings. Anthropic says conversation content is not retained by default, with exceptions (flagged content, legal holds and certain models), and its Commercial Terms say it may not train models on Customer Content. Google says paid prompts are not used to improve its products, are logged for a limited period, and may be stored transiently or cached in any country where it maintains facilities.

## Overseas disclosure

The ICO says that where a transfer safeguard is relied on, a transfer risk assessment must also be completed, and that the rules apply to a restricted transfer whether the party is a controller, processor or sub-processor. [To be confirmed: the transfer mechanism, the transfer risk assessment and whether the UK-US data bridge applies.]

## Security incidents

We will tell the firm without undue delay after becoming aware of a personal data breach affecting its data, with the information we have. [To be confirmed: UK breach-reporting deadlines.]

## When the service ends

When a workspace is deleted, its records, documents, conversations and audit log are deleted from the database; copies remain in backups until those expire ([Owner: backup retention period]). Before then the firm can export what it needs. [Owner: export arrangements.]
