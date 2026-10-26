// Extraction stays local. No HTML from a document is rendered.
export async function readDocument(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose a document smaller than 8 MB.');
  if (/\.docx$/i.test(file.name)) {
    const {extractRawText} = await import('mammoth/mammoth.browser');
    const result = await extractRawText({arrayBuffer: await file.arrayBuffer()});
    if (result.value.length > 200000) throw new Error('Extracted document is too large. Split it into instruments.');
    return result.value;
  }
  if (/\.(txt|md)$/i.test(file.name)) return file.text();
  throw new Error('Use DOCX or TXT. For Google Docs: File → Download → Microsoft Word (.docx). For old .doc files, save as .docx first.');
}
export function documentSections(text) {
  return text.split(/^\s*===+\s*$/m).map(part=>part.trim()).filter(Boolean);
}
