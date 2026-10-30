import type { DocumentKind } from '../documents/extract';

/** The wire shape of a stored document. Never carries bytes or text. */
export interface DocumentView {
  id: string;
  clientId: string;
  originalName: string;
  kind: DocumentKind;
  byteSize: number;
  textChars: number;
  truncated: boolean;
  uploadedBy: string;
  requestId: string | null;
  supersedesId: string | null;
  fromClientLink: boolean;
  createdAt: string;
}
