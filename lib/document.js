export const MAX_BYTES = 30 * 1024 * 1024;
export const MAX_PAGES = 40;
export const MAX_CHARS = 180000;

export async function extractDocument(bytes, name) {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Choose a nonempty PDF or TXT file under 30 MB.');
  let pages;
  if (/\.pdf$/i.test(name)) {
    if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('This file is not a valid PDF.');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false });
    try {
      const doc = await task.promise;
      if (doc.numPages > MAX_PAGES) throw new Error('Choose a chapter of 40 pages or fewer. Split larger books into chapters.');
      pages = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        pages.push({ page: n, text: content.items.map(x => x.str ? x.str + (x.hasEOL ? '\n' : ' ') : '').join('').trim() });
        page.cleanup();
      }
    } finally { await task.destroy(); }
  } else if (/\.txt$/i.test(name)) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // TXT has no physical pages: stable source sections serve as references.
    pages = text.match(/[\s\S]{1,6000}/g).map((text, i) => ({ page: i + 1, text: text.trim() }));
  } else throw new Error('Only text-based PDF and UTF-8 TXT files are supported.');
  const length = pages.reduce((n, p) => n + p.text.length, 0);
  if (length < 100) throw new Error('Not enough selectable text. Scanned PDFs need OCR first; export them as searchable PDF or TXT.');
  if (length > MAX_CHARS) throw new Error('This chapter is too long (maximum 180,000 characters). Split it into smaller chapters.');
  return { name, pages, characters: length, emptyPages: pages.filter(p => p.text.length < 20).map(p => p.page), referenceLabel: /\.pdf$/i.test(name) ? 'Page' : 'Section' };
}

export function sourceChunks(pages, size = 1500) {
  return pages.flatMap(p => {
    const words = p.text.split(/\s+/).filter(Boolean);
    const chunks = []; let text = '';
    for (const word of words) {
      if (text.length + word.length > size && text) { chunks.push(`[Page ${p.page}] ${text}`); text = ''; }
      text += (text ? ' ' : '') + word;
    }
    if (text) chunks.push(`[Page ${p.page}] ${text}`);
    return chunks;
  });
}

export function sourceBatches(chunks, size = 14000) {
  const batches = []; let current = '';
  for (const chunk of chunks) {
    if (current.length + chunk.length > size && current) { batches.push(current); current = ''; }
    current += chunk + '\n\n';
  }
  if (current) batches.push(current);
  return batches;
}

export function parseScript(raw, pageCount) {
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const start = clean.indexOf('{'); const end = clean.lastIndexOf('}');
  let script;
  try { script = JSON.parse(clean.slice(start, end + 1)); } catch { throw new Error('The language model returned incomplete dialogue. Please retry synthesis.'); }
  if (!script || typeof script.title !== 'string' || !Array.isArray(script.turns) || script.turns.length < 4 || script.turns.length > 16) throw new Error('The model returned an invalid podcast structure. Please retry.');
  let words = 0;
  for (const [i, turn] of script.turns.entries()) {
    if (turn.speaker !== (i % 2 === 0 ? 'Maya' : 'Leo') || typeof turn.text !== 'string' || !turn.text.trim() || turn.text.length > 1000) throw new Error('The dialogue must alternate Maya and Leo, with short spoken turns. Please retry.');
    turn.text = turn.text.replace(/\s+/g, ' ').trim();
    words += turn.text.split(/\s+/).length;
    if (!Array.isArray(turn.pages) || !turn.pages.length || turn.pages.some(p => !Number.isInteger(p) || p < 1 || p > pageCount)) throw new Error('The model returned invalid source references. Please retry.');
    turn.pages = [...new Set(turn.pages)];
  }
  if (words > 900) throw new Error('The generated podcast is too long. Please retry.');
  script.title = script.title.slice(0, 160);
  return script;
}

export function sentences(text) {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  return [...segmenter.segment(text)].map(x => x.segment.trim()).filter(Boolean);
}
