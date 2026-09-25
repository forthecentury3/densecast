import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, DATA } from '../lib/runtime.js';
import { wavHeader } from '../lib/audio.js';

test('fresh local server, input validation, origin guard, persisted output and audio seeking', async t => {
  await mkdir(path.join(DATA, 'tests'), { recursive: true });
  const dir = await mkdtemp(path.join(DATA, 'tests', 'http-'));
  const id = '11111111-1111-4111-8111-111111111111'; const jobDir = path.join(dir, 'jobs', id);
  await mkdir(jobDir, { recursive: true });
  const samples = Buffer.alloc(88200);
  await writeFile(path.join(jobDir, 'podcast.wav'), Buffer.concat([wavHeader(samples.length, 44100), samples]));
  await writeFile(path.join(jobDir, 'transcript.json'), JSON.stringify({ title: 'HTTP test fixture', duration: 1, segments: [] }));
  const port = 32189;
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), PODCAST_DATA_DIR: dir }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    const stopped = once(child, 'exit'); child.kill(); await stopped;
    // Only remove the exact directory this test created, under this project's .data/tests.
    if (path.dirname(dir) !== path.join(DATA, 'tests')) throw new Error('Unsafe test cleanup path');
    await rm(dir, { recursive: true, force: true });
  });
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(([code]) => { throw new Error(`Server exited ${code}`); }), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000); timer.unref(); })]);
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  const html = await fetch(base); assert.match(await html.text(), /Synthesize podcast/); assert.match(html.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(`${base}/api/health`, { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(`${base}/api/jobs?name=file.html`, { method: 'POST', body: 'x' })).status, 400);
  assert.equal((await fetch(`${base}/api/jobs?name=empty.txt`, { method: 'POST', body: '' })).status, 400);
  assert.equal((await fetch(`${base}/api/latest`).then(r => r.json())).status, 'done');
  const range = await fetch(`${base}/api/jobs/${id}/podcast.wav`, { headers: { Range: 'bytes=44-143' } });
  assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 100);
  assert.equal(range.headers.get('content-range'), 'bytes 44-143/88244');
  assert.equal((await fetch(`${base}/api/jobs/${id}/podcast.wav`, { headers: { Range: 'bytes=999999-' } })).status, 416);
  const download = await fetch(`${base}/api/jobs/${id}/transcript.json?download`);
  assert.match(download.headers.get('content-disposition'), /attachment/);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
});
