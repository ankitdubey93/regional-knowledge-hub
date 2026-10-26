import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('unpdf', () => ({ extractText: vi.fn() }));
vi.mock('mammoth', () => ({ default: { convertToHtml: vi.fn() } }));

import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import { ExtractError, extractFile, fileKindOf, htmlToMarkdown } from '../kb/extract';

describe('kb extract', () => {
  beforeEach(() => {
    vi.mocked(extractText).mockReset();
    vi.mocked(mammoth.convertToHtml).mockReset();
  });

  it('X1 fileKindOf maps extensions and rejects others', () => {
    expect(fileKindOf('Act.PDF')).toBe('pdf');
    expect(fileKindOf('a.htm')).toBe('html');
    expect(fileKindOf('a.exe')).toBeNull();
  });

  it('X2 htmlToMarkdown keeps headings and drops navigation', () => {
    const md = htmlToMarkdown('<nav>Menu</nav><h2>Section 9-5 What is a taxable supply</h2><p>Body</p><script>x()</script>');
    expect(md).toContain('## Section 9-5 What is a taxable supply');
    expect(md).toContain('Body');
    expect(md).not.toContain('Menu');
    expect(md).not.toContain('x()');
  });

  it("X3 a PDF's running header is removed", async () => {
    vi.mocked(extractText).mockResolvedValue({
      totalPages: 3,
      text: ['Example Act 2026\nFirst page body', 'Example Act 2026\nSecond page body', 'Example Act 2026\nThird page body'],
    } as never);
    const out = await extractFile('pdf', new Uint8Array([1]));
    expect(out.split('Example Act 2026').length - 1).toBe(0);
    expect(out).toContain('Second page body');
  });

  it('X4 an empty PDF throws ExtractError with the scanned-image message', async () => {
    vi.mocked(extractText).mockResolvedValue({ totalPages: 1, text: ['   '] } as never);
    const err = await extractFile('pdf', new Uint8Array([1])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractError);
    expect((err as Error).message).toBe('No text found in the PDF. It may be a scanned image: paste the text instead.');
  });

  it('X5 docx goes through mammoth then turndown', async () => {
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({ value: '<h1>Title</h1><p>Text</p>', messages: [] });
    expect(await extractFile('docx', new Uint8Array([1]))).toBe('# Title\n\nText');
  });
});
