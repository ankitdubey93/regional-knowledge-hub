import { Callout, TextLink } from './ui';

// Stage 3: says what redaction removes and what it does not, wherever text leaves for the AI.

const DOCUMENTS_TEXT =
  "Before a document reaches the AI, these are replaced with placeholders: your clients' names (also without Pty Ltd, Ltd or Limited), email addresses, phone numbers, bank and card numbers, IBANs, ABNs, TFNs and ACNs, UTRs and National Insurance numbers. Other names are not caught: staff, directors, suppliers and customers reach the AI as written, so remove them from a file first if they must not leave this service. Documents are context only: answers never cite them.";

const CHAT_TEXT =
  "Your question goes to the AI after the same replacements: your clients' names, email addresses, and phone, bank, card and tax numbers. Other people's and companies' names are not caught, so leave out any that must not leave this service.";

export function RedactionNotice({ variant, firmName }: { variant: 'documents' | 'chat' | 'client-upload'; firmName?: string }) {
  if (variant === 'client-upload') {
    return (
      <Callout tone="warn">
        {`${firmName ?? 'The firm'} may use the files you upload with an AI assistant. Email addresses, phone, bank and tax numbers and the firm's client names are replaced first; other names are not.`}
      </Callout>
    );
  }
  return (
    <Callout tone="warn">
      {variant === 'documents' ? DOCUMENTS_TEXT : CHAT_TEXT}{' '}
      <TextLink to="/legal/subprocessors">Who processes your data</TextLink>
    </Callout>
  );
}
