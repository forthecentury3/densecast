import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractDocument, sourceChunks, sourceBatches, parseScript, sentences } from '../lib/document.js';
import { pcmToBuffer, wavHeader, toVtt } from '../lib/audio.js';
import { explainError } from '../lib/runtime.js';
import { textPdf } from './fixtures.js';

const sample = await readFile(new URL('../examples/systems-analysis.txt', import.meta.url));
test('TXT extraction, stable references, and complete chunk coverage', async () => {
  const doc = await extractDocument(sample, 'chapter.txt');
  const chunks = sourceChunks(doc.pages); const batches = sourceBatches(chunks, 1600);
  assert.ok(chunks.length > 1); assert.ok(batches.length > 1);
  const recovered = chunks.map(s => s.replace(/^\[Page \d+\] /, '')).join(' ');
  assert.equal(recovered, doc.pages.map(p => p.text).join(' ').replace(/\s+/g, ' ').trim());
});
test('20-page PDF retains the final page and page references', async () => {
  const pages = Array.from({ length: 20 }, (_, i) => `Topic ${i + 1}. ${sample.toString().slice(0, 1700)} UniqueMarker${i + 1}.`);
  const doc = await extractDocument(textPdf(pages), 'chapter.pdf');
  assert.equal(doc.pages.length, 20); assert.ok(doc.pages[19].text.includes('UniqueMarker20'));
  assert.ok(sourceChunks(doc.pages).some(s => s.startsWith('[Page 20]')));
});
test('rejects empty, non-PDF, scanned, invalid encoding, and oversized chapters', async () => {
  await assert.rejects(extractDocument(Buffer.alloc(0), 'blank.pdf'), /nonempty/);
  await assert.rejects(extractDocument(sample, 'fake.pdf'), /valid PDF/);
  await assert.rejects(extractDocument(textPdf(['']), 'scanned.pdf'), /OCR/);
  await assert.rejects(extractDocument(textPdf(Array(41).fill('Text')), 'book.pdf'), /40 pages/);
  await assert.rejects(extractDocument(Buffer.from([255, 254, 250]), 'invalid.txt'));
  await assert.rejects(extractDocument(sample, 'chapter.html'), /supported/);
});
test('dialogue validates alternation, citations, and sentence identity', () => {
  const script = { title: 'Systems', turns: Array.from({ length: 4 }, (_, i) => ({ speaker: i % 2 ? 'Leo' : 'Maya', text: 'What is analysis? It defines needs.', pages: [1] })) };
  assert.equal(parseScript(JSON.stringify(script), 1).turns.length, 4);
  assert.equal(sentences(script.turns[0].text).join(' '), script.turns[0].text);
  script.turns[0].pages = [2]; assert.throws(() => parseScript(JSON.stringify(script), 1), /references/);
  script.turns[0].pages = [1]; script.turns[1].speaker = 'Maya'; assert.throws(() => parseScript(JSON.stringify(script), 1), /alternate/);
  assert.throws(() => parseScript('{"title":', 1), /incomplete/);
});
test('PCM encoding, WAV duration, and VTT use exact sample boundaries', () => {
  const pcm = pcmToBuffer([0, -32768, 32767, 0]); const h = wavHeader(pcm.length, 44100);
  assert.equal(h.readUInt32LE(40), 8); assert.equal(h.readUInt32LE(28), 88200);
  assert.equal(pcm.readInt16LE(2), -32768); assert.equal(pcm.readInt16LE(4), 32767);
  const segments = [{ speaker: 'Maya', text: 'Hello.', start: 0, end: 1.25 }, { speaker: 'Leo', text: 'Hi.', start: 1.49, end: 2.5 }];
  const vtt = toVtt(segments); assert.match(vtt, /00:00:01.490 --> 00:00:02.500/);
  assert.throws(() => pcmToBuffer([]), /no audio/); assert.throws(() => pcmToBuffer([NaN]), /Invalid sample/);
  assert.throws(() => pcmToBuffer([0, 0, 0]), /silence/);
  assert.throws(() => wavHeader(4, undefined), /sample rate/);
});
test('RPC timeout includes the underlying worker failure', () => {
  const cause = new Error('Missing Vulkan DLL'); cause.stderrTail = 'native loader exit';
  const error = new Error('RPC initialization timed out', { cause });
  const explanation = explainError(error);
  assert.match(explanation, /Missing Vulkan DLL/); assert.match(explanation, /native loader exit/); assert.match(explanation, /npm run doctor/);
});
