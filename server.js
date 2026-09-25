import http from 'node:http';
import { fork, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { ROOT, DATA } from './lib/runtime.js';
import { MAX_BYTES } from './lib/document.js';

const port = Number(process.env.PORT || 3000);
const jobsDir = path.join(DATA, 'jobs');
await mkdir(jobsDir, { recursive: true });
const jobs = new Map(); let active = null;
const validId = id => /^[0-9a-f-]{36}$/.test(id);
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
async function storedJob(id) {
  if (!validId(id)) return null;
  if (jobs.has(id)) return jobs.get(id);
  try { return JSON.parse(await readFile(path.join(jobsDir, id, 'job.json'), 'utf8')); }
  catch {
    try { const result = JSON.parse(await readFile(path.join(jobsDir, id, 'transcript.json'), 'utf8')); return { id, status: 'done', stage: 'done', percent: 100, message: 'Your podcast is ready.', result }; }
    catch { return null; }
  }
}

async function serveFile(req, res, filename, contentType, download = false) {
  const info = await stat(filename);
  const headers = { 'Content-Type': contentType, 'Content-Length': info.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  if (download) headers['Content-Disposition'] = `attachment; filename="${path.basename(filename)}"`;
  let start = 0; let end = info.size - 1; let status = 200;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
    if (match[1]) { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; }
    else start = Math.max(0, info.size - Number(match[2]));
    if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`; headers['Content-Length'] = end - start + 1;
  }
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(filename, { start, end });
  stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const host = req.headers.host;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) return json(res, 403, { error: 'Use the local address printed in the terminal.' });
  if (req.headers.origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin)) return json(res, 403, { error: 'Only the local app can access this server.' });
  const url = new URL(req.url, `http://${host}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/jobs') {
      if (active) return json(res, 409, { error: 'A podcast is already being generated. Wait for it to finish.' });
      const name = path.basename(url.searchParams.get('name') || '').slice(0, 180);
      if (!/\.(pdf|txt)$/i.test(name)) return json(res, 400, { error: 'Choose a PDF or TXT chapter.' });
      if (Number(req.headers['content-length']) > MAX_BYTES) return json(res, 413, { error: 'File is too large. Maximum: 30 MB.' });
      // Reserve the single generation slot before reading the upload.
      active = { uploading: true };
      let bytes = 0; const chunks = [];
      try {
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) throw new Error('File is too large. Maximum: 30 MB.');
          chunks.push(chunk);
        }
        if (!bytes) throw new Error('The selected file is empty.');
        const id = randomUUID(); const dir = path.join(jobsDir, id);
        await mkdir(dir, { recursive: true });
        const input = path.join(dir, /\.pdf$/i.test(name) ? 'input.pdf' : 'input.txt');
        await writeFile(input, Buffer.concat(chunks));
        const job = { id, name, status: 'running', stage: 'read', percent: 1, message: 'Starting local engine…', createdAt: new Date().toISOString() };
        jobs.set(id, job);
        const child = fork(path.join(ROOT, 'scripts', 'job.js'), [], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
        active = { child, id };
        let stderr = '';
        child.stdout.on('data', data => process.stdout.write(data));
        child.stderr.on('data', data => { stderr = (stderr + data).slice(-6000); process.stderr.write(data); });
        child.on('message', update => {
          if (update.type === 'error') { job.status = 'error'; job.message = update.message; }
          else { const { type, ...progress } = update; Object.assign(job, progress); }
        });
        child.on('error', error => { job.status = 'error'; job.message = error.message; });
        child.on('exit', async code => {
          clearTimeout(timer);
          if (code === 0 && job.result) { job.status = 'done'; job.percent = 100; }
          else if (job.status !== 'error') { job.status = 'error'; job.message = `The local engine stopped (exit ${code}). Run npm run doctor and check available memory.\n${stderr}`; }
          try { await writeFile(path.join(dir, 'job.json'), JSON.stringify(job, null, 2)); }
          catch (error) { console.error('Could not save job status:', error.message); }
          if (active?.id === id) active = null;
        });
        const timer = setTimeout(() => { job.status = 'error'; job.message = 'Generation exceeded 90 minutes. Check model downloads and available memory, then retry.'; stopChild(child); }, 90 * 60 * 1000);
        child.send({ id, input, name });
        return json(res, 202, { id });
      } catch (error) { if (active?.uploading) active = null; return json(res, 400, { error: error.message }); }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, sdk: '0.19.1', active: active?.id || null });
    if (url.pathname === '/api/latest') {
      if (active?.id) return json(res, 200, await storedJob(active.id));
      const dirs = (await readdir(jobsDir, { withFileTypes: true })).filter(d => d.isDirectory() && validId(d.name));
      const sorted = await Promise.all(dirs.map(async d => ({ id: d.name, time: (await stat(path.join(jobsDir, d.name))).mtimeMs })));
      sorted.sort((a, b) => b.time - a.time);
      for (const entry of sorted) { const job = await storedJob(entry.id); if (job) return json(res, 200, job); }
      return json(res, 200, null);
    }
    const match = /^\/api\/jobs\/([0-9a-f-]{36})(?:\/(podcast\.wav|transcript\.json|transcript\.vtt|source\.json))?$/.exec(url.pathname);
    if (match) {
      const job = await storedJob(match[1]);
      if (!job) return json(res, 404, { error: 'Podcast not found.' });
      if (!match[2]) return json(res, 200, job);
      if (!job.result) return json(res, 409, { error: 'The podcast is still being created.' });
      return await serveFile(req, res, path.join(jobsDir, match[1], match[2]), match[2].endsWith('.wav') ? 'audio/wav' : match[2].endsWith('.vtt') ? 'text/vtt; charset=utf-8' : 'application/json', url.searchParams.has('download'));
    }
    const files = { '/': ['public/index.html', 'text/html'], '/app.js': ['public/app.js', 'text/javascript'], '/style.css': ['public/style.css', 'text/css'], '/sample.txt': ['examples/systems-analysis.txt', 'text/plain'] };
    if (files[url.pathname]) { const [file, type] = files[url.pathname]; return await serveFile(req, res, path.join(ROOT, file), `${type}; charset=utf-8`); }
    return json(res, 404, { error: 'Not found.' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, error.code === 'ENOENT' ? 404 : 500, { error: error.code === 'ENOENT' ? 'File not found.' : 'Local server error. Check the terminal.' });
    else res.destroy();
  }
});
function stopChild(child) {
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill('SIGTERM');
}
function shutdown() { if (active?.child) stopChild(active.child); server.close(); setTimeout(() => process.exit(0), 1000).unref(); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Stop the other instance or set PORT to another port.` : error); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`\nDensecast · http://127.0.0.1:${port}\nQVAC 0.19.1 · inference stays on this device\nPress Ctrl+C to stop.\n`));
