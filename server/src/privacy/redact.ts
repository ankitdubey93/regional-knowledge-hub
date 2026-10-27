export const REDACTION_KINDS = ['NAME', 'EMAIL', 'IBAN', 'CARD', 'BANK', 'PHONE', 'ABN', 'UTR', 'TAXID', 'NINO'] as const;
type RedactionKind = (typeof REDACTION_KINDS)[number];

export interface RedactOptions {
  names: string[];
}

interface State {
  counts: Map<RedactionKind, number>;
  seen: Map<string, string>;
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

function placeholder(state: State, kind: RedactionKind, matched: string): string {
  const key = `${kind}:${collapse(matched)}`;
  const known = state.seen.get(key);
  if (known) return known;
  const n = (state.counts.get(kind) ?? 0) + 1;
  state.counts.set(kind, n);
  const token = `[${kind}_${n}]`;
  state.seen.set(key, token);
  return token;
}

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replaces personal details with typed placeholders ([EMAIL_1], [NAME_2]). Pure; never logs. */
export function redact(text: string, opts: RedactOptions): string {
  const state: State = { counts: new Map(), seen: new Map() };
  let out = text;

  const apply = (kind: RedactionKind, re: RegExp): void => {
    out = out.replace(re, (m) => placeholder(state, kind, m));
  };

  // 1. NAME
  const names = opts.names
    .map((n) => n.trim())
    .filter((n) => n.length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const name of names) {
    const body = name.split(/\s+/).map(escapeRegex).join('\\s+');
    apply('NAME', new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu'));
  }

  // 2. EMAIL
  apply('EMAIL', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g);
  // 3. IBAN
  apply('IBAN', /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g);
  // 4. CARD: only when the digits pass the Luhn check
  out = out.replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhn(digits)) return m;
    return placeholder(state, 'CARD', m);
  });
  // 5. BANK (BSB and account, sort code and account)
  apply('BANK', /\b\d{3}-?\d{3} +\d{6,10}\b|\b\d{2}-\d{2}-\d{2} +\d{8}\b/g);
  // 6. PHONE (AU, then UK)
  apply('PHONE', /(?:\+61 ?|\b0)[2-478](?:[ -]?\d){8}\b|(?:\+44 ?|\b0)\d(?:[ -]?\d){8,9}\b/g);
  // 7. ABN (no checksum: over-redacting is the safe failure)
  apply('ABN', /\b\d{2} ?\d{3} ?\d{3} ?\d{3}\b/g);
  // 8. UTR
  apply('UTR', /\b\d{5} ?\d{5}\b/g);
  // 9. TAXID (TFN or ACN)
  apply('TAXID', /\b\d{3} ?\d{3} ?\d{3}\b/g);
  // 10. NINO. Q is allowed in both prefix letters (HMRC's own example is QQ123456C); over-redacting is the safe failure.
  apply('NINO', /\b[A-CEGHJ-TW-Z][A-CEGHJ-NP-TW-Z] ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/gi);

  return out;
}
