import { extractText, getDocumentProxy } from "unpdf";

/** Extract the full text layer of a PDF. Pure text — no OCR (scanned PDFs return empty). */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}
