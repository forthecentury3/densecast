import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ROOT, DATA, explainError } from '../lib/runtime.js';
import { createPodcast } from '../lib/pipeline.js';

const input = path.resolve(process.argv[2] || path.join(ROOT, 'examples', 'systems-analysis.txt'));
const id = randomUUID(); let previous = '';
console.log('REAL inference test: first run downloads Qwen3 8B, EmbeddingGemma, and Supertonic 3. This may take several minutes.');
try {
  const result = await createPodcast({ id, input, name: path.basename(input), brief: true }, update => {
    if (update.message !== previous) { console.log(`[${update.percent}%] ${update.message}`); previous = update.message; }
  });
  const wav = await readFile(path.join(DATA, 'jobs', id, 'podcast.wav'));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(40), wav.length - 44);
  assert.equal(wav.readUInt32LE(24), result.sampleRate);
  assert.ok(Math.abs((wav.length - 44) / (result.sampleRate * 2) - result.duration) < 0.00001);
  assert.deepEqual([...new Set(result.segments.map(s => s.speaker))].sort(), ['Leo', 'Maya']);
  for (const [i, segment] of result.segments.entries()) {
    assert.ok(segment.end > segment.start);
    assert.ok(segment.start >= (result.segments[i - 1]?.end || 0));
    assert.ok(segment.end <= result.duration);
  }
  assert.ok((await stat(path.join(DATA, 'jobs', id, 'transcript.vtt'))).size > 100);
  await mkdir(path.join(ROOT, 'artifacts'), { recursive: true });
  await writeFile(path.join(ROOT, 'artifacts', 'live-test.json'), JSON.stringify({ testedAt: new Date().toISOString(), platform: process.platform, node: process.version, jobId: id, duration: result.duration, segments: result.segments.length, models: result.models, input, passed: true }, null, 2));
  console.log(`PASS: real QVAC podcast (${result.duration.toFixed(1)} seconds). Files: ${path.join(DATA, 'jobs', id)}`);
} catch (error) { console.error(explainError(error)); process.exitCode = 1; }
