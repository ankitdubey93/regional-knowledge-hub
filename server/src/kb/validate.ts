import type { KbIssue, KbSource } from '../types/kb';
import { LONG_CHUNK_TOKENS, type RawChunk } from './chunk';
import { hostOf, isOfficialUrl } from './officialSites';

export interface ValidateInput {
  kind: KbSource['kind']; officialUrl: string | null; billStatus: KbSource['billStatus'];
  effectiveFrom: string | null; bodyMd: string; chunks: RawChunk[]; duplicateOfLabel: string | null;
  unknownFacts: string[];
}

/** Blocking issues stop a version from being published (Hard rule 2). Warnings do not. Order is fixed. */
export function validateVersion(i: ValidateInput): KbIssue[] {
  const issues: KbIssue[] = [];

  if (i.kind !== 'curriculum' && i.officialUrl === null) {
    issues.push({ level: 'block', code: 'no_url', message: 'Add the official URL for this source' });
  }
  if (i.officialUrl !== null && !isOfficialUrl(i.officialUrl)) {
    issues.push({
      level: 'block',
      code: 'url_not_official',
      message: `The official URL is not on an official site: ${hostOf(i.officialUrl)}`,
    });
  }
  if ((i.kind === 'act' || i.kind === 'regulation' || i.kind === 'standard') && i.effectiveFrom === null) {
    issues.push({ level: 'block', code: 'no_effective_date', message: 'Add the date this version takes effect' });
  }
  if (i.kind === 'bill' && i.billStatus === null) {
    issues.push({ level: 'block', code: 'bill_status_missing', message: 'Set the Bill\'s status' });
  }
  if (i.chunks.length === 0) {
    issues.push({ level: 'block', code: 'no_chunks', message: 'The text produced no chunks' });
  }
  if (i.unknownFacts.length > 0) {
    issues.push({ level: 'block', code: 'unknown_fact', message: `Unknown fact key(s): ${i.unknownFacts.join(', ')}` });
  }

  const longCount = i.chunks.filter((c) => c.tokens > LONG_CHUNK_TOKENS).length;
  if (longCount > 0) {
    issues.push({
      level: 'warn',
      code: 'long_chunk',
      message: `${longCount} chunk(s) are over 1,500 tokens: add headings to split them`,
    });
  }
  if ((i.kind === 'act' || i.kind === 'regulation' || i.kind === 'bill') && i.chunks.length > 0 && i.chunks.every((c) => c.provisionRef === null)) {
    issues.push({
      level: 'warn',
      code: 'no_provisions',
      message: 'No sections were detected: add ## headings to split the text by provision',
    });
  }
  if (i.duplicateOfLabel !== null) {
    issues.push({ level: 'warn', code: 'duplicate', message: `This text is identical to version "${i.duplicateOfLabel}"` });
  }
  if (i.bodyMd.trim().length < 200) {
    issues.push({ level: 'warn', code: 'short_text', message: 'The text is very short: check that the whole document came through' });
  }
  return issues;
}
