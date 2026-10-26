import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { extractText } from 'unpdf';
import { normaliseText, stripRepeatedPageLines } from './normalise';

export type FileKind = 'text' | 'markdown' | 'html' | 'pdf' | 'docx';

export class ExtractError extends Error {}

const EXTENSIONS: Record<string, FileKind> = {
  '.txt': 'text',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.html': 'html',
  '.htm': 'html',
  '.pdf': 'pdf',
  '.docx': 'docx',
};

/** By extension, case-insensitive: .txt text; .md/.markdown markdown; .html/.htm html; .pdf pdf; .docx docx; else null. */
export function fileKindOf(name: string): FileKind | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  return EXTENSIONS[name.slice(dot).toLowerCase()] ?? null;
}

/** Turndown with headingStyle 'atx', bulletListMarker '-', codeBlockStyle 'fenced'; removes page furniture tags. */
export function htmlToMarkdown(html: string): string {
  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
  td.remove(['script', 'style', 'nav', 'header', 'footer', 'aside', 'form', 'noscript', 'iframe', 'button']);
  return td.turndown(html);
}

const decode = (bytes: Uint8Array): string => new TextDecoder('utf-8').decode(bytes);

/** Returns normalised text (normaliseText). */
export async function extractFile(kind: FileKind, bytes: Uint8Array): Promise<string> {
  switch (kind) {
    case 'text':
    case 'markdown':
      return normaliseText(decode(bytes));
    case 'html':
      return normaliseText(htmlToMarkdown(decode(bytes)));
    case 'pdf': {
      let pages: string[];
      try {
        pages = (await extractText(bytes, { mergePages: false })).text;
      } catch {
        throw new ExtractError('Could not read the PDF file');
      }
      const text = normaliseText(stripRepeatedPageLines(pages));
      if (text === '') {
        throw new ExtractError('No text found in the PDF. It may be a scanned image: paste the text instead.');
      }
      return text;
    }
    case 'docx': {
      let html: string;
      try {
        html = (await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })).value;
      } catch {
        throw new ExtractError('Could not read the .docx file');
      }
      return normaliseText(htmlToMarkdown(html));
    }
  }
}
