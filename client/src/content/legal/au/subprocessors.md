# Sub-processors

Version: 2026-10-31-draft · Region: Australia

These are the providers that handle information on our behalf for the Australian deployment. This list is a draft and has not been reviewed by a lawyer.

| Sub-processor | What it does | Data it receives | Where |
|---|---|---|---|
| Anthropic | Writes chat answers | Redacted questions, redacted text of attached documents and knowledge-base extracts; figures from a firm's imported books when the question concerns them | United States (inference pinned to US infrastructure) |
| Google | Creates embeddings for search, and writes chat answers if enabled | Knowledge-base text and redacted questions; redacted document text only if Google is the chat provider | Any country where Google or its agents maintain facilities |
| [Owner: hosting provider] | Database, files and backups | Everything stored | Australia |
| [Owner: email provider] | Sends sign-up, reset, invitation and request emails | Email addresses and the text of the email | [Owner: region] |

Changes are announced to firms before they take effect ([Owner: notice period]). [To be confirmed: Anthropic's and Google's own sub-processor lists.]
