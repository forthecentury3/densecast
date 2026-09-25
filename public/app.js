const $ = id => document.getElementById(id);
let selected = null, busy = false, currentJob = null, result = null, source = null, pollTimer, startTime;
let rendered = '', amplitudes = [], activeSentence = -1, playbackFrame;
const audio = $('audio');
const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function choose(file) {
  if (!file || busy) return;
  if (!/\.(pdf|txt)$/i.test(file.name) || file.size > 30 * 1024 * 1024 || !file.size) return showError('Choose a nonempty PDF or TXT chapter under 30 MB.');
  selected = file; $('file-name').textContent = file.name;
  $('file-detail').textContent = `${(file.size / 1024).toFixed(0)} KB · ready to turn into a conversation`;
  $('synthesize').disabled = false; $('error').hidden = true;
}
function showError(message) { $('error').textContent = message; $('error').hidden = false; }
function setBusy(value) {
  busy = value; $('synthesize').disabled = value || !selected; $('sample').disabled = value; $('file').disabled = value;
  $('dropzone').classList.toggle('disabled', value);
}
$('file').addEventListener('change', event => choose(event.target.files[0]));
for (const eventName of ['dragover', 'dragenter']) $('dropzone').addEventListener(eventName, event => { event.preventDefault(); if (!busy) $('dropzone').classList.add('drag'); });
for (const eventName of ['dragleave', 'drop']) $('dropzone').addEventListener(eventName, event => { event.preventDefault(); $('dropzone').classList.remove('drag'); });
$('dropzone').addEventListener('drop', event => choose(event.dataTransfer.files[0]));
window.addEventListener('dragover', event => event.preventDefault()); window.addEventListener('drop', event => event.preventDefault());
$('sample').addEventListener('click', async () => {
  try { const response = await fetch('/sample.txt'); if (!response.ok) throw new Error('Could not load the sample.'); choose(new File([await response.blob()], 'systems-analysis.txt', { type: 'text/plain' })); }
  catch (error) { showError(error.message); }
});
async function api(url, options) { const response = await fetch(url, options); const data = await response.json(); if (!response.ok) { const error = new Error(data.error || 'Request failed.'); error.status = response.status; throw error; } return data; }
$('synthesize').addEventListener('click', async () => {
  if (!selected || busy) return;
  clearTimeout(pollTimer); setBusy(true); audio.pause(); audio.removeAttribute('src');
  result = null; source = null; rendered = ''; amplitudes = []; currentJob = null;
  $('error').hidden = true; $('empty').hidden = true; $('episode').hidden = true; $('transcript-panel').hidden = true;
  $('progress-panel').hidden = false; $('progress-message').textContent = 'Uploading to the local engine…'; $('progress').value = 0; $('progress-value').textContent = '0%';
  $('source-detail').textContent = ''; $('elapsed').textContent = ''; startTime = Date.now();
  try { const { id } = await api(`/api/jobs?name=${encodeURIComponent(selected.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: selected }); currentJob = id; await poll(); }
  catch (error) { showError(error.message); setBusy(false); }
});
async function poll() {
  try {
    const job = await api(`/api/jobs/${currentJob}`); update(job);
    if (job.status === 'running') pollTimer = setTimeout(poll, 900);
  } catch (error) {
    if (error.status === 404) { setBusy(false); showError('This unfinished job is no longer available after a server restart. Select your chapter and synthesize again.'); return; }
    showError('Connection interrupted. Keep the terminal running. Reconnecting…');
    pollTimer = setTimeout(poll, 3000);
  }
}
function update(job) {
  $('empty').hidden = true; $('progress-panel').hidden = false;
  $('progress-message').textContent = job.message; $('progress').value = job.percent; $('progress-value').textContent = `${job.percent}%`;
  $('studio-badge').textContent = job.status === 'done' ? 'READY TO LISTEN' : job.status === 'error' ? 'NEEDS ATTENTION' : 'CREATING LOCALLY';
  $('studio-badge').classList.toggle('ready', job.status === 'done');
  const stages = ['read', 'index', 'write', 'voice', 'done']; const index = stages.indexOf(job.stage);
  for (const li of document.querySelectorAll('.stages li')) { li.classList.toggle('active', li.dataset.stage === job.stage); li.classList.toggle('past', stages.indexOf(li.dataset.stage) < index); }
  if (job.document) $('source-detail').textContent = `${job.document.name} · ${job.document.pages} ${job.document.referenceLabel.toLowerCase()}s · ${job.document.characters.toLocaleString()} characters${job.document.emptyPages.length ? ` · Little or no text on pages ${job.document.emptyPages.join(', ')}; check the source.` : ''}`;
  if (job.status === 'running') {
    setBusy(true); $('error').hidden = true;
    $('elapsed').textContent = `${formatTime((Date.now() - startTime) / 1000)} elapsed · first-run downloads and CPU generation can take several minutes`;
    if (job.script) renderTranscript(job.script.turns, null);
  } else if (job.status === 'error') {
    setBusy(false); $('progress-message').textContent = 'The engine needs attention.'; showError(job.message);
  } else {
    setBusy(false); $('error').hidden = true; $('progress-panel').hidden = true;
    if (!result) { result = job.result; showEpisode(job); }
  }
}
function renderTranscript(turns, segments) {
  const key = JSON.stringify({ turns, final: !!segments }); if (key === rendered) return; rendered = key;
  $('transcript-panel').hidden = false; $('transcript').replaceChildren();
  $('sync-label').textContent = segments ? 'SYNCED TO AUDIO · CLICK TO SEEK' : 'VOICE RECORDING IN PROGRESS';
  for (const [index, turn] of turns.entries()) {
    const row = document.createElement('div'); row.className = 'turn'; row.dataset.turn = index;
    const avatar = document.createElement('span'); avatar.className = `avatar ${turn.speaker.toLowerCase()}`; avatar.textContent = turn.speaker[0];
    const body = document.createElement('div'); const header = document.createElement('div'); header.className = 'turn-header';
    const name = document.createElement('strong'); name.textContent = turn.speaker; header.append(name);
    if (segments) { const time = document.createElement('small'); time.textContent = formatTime(segments.find(s => s.turnIndex === index).start); header.append(time); }
    const p = document.createElement('p');
    if (segments) {
      segments.forEach((segment, i) => {
        if (segment.turnIndex !== index) return;
        const button = document.createElement('button'); button.className = 'sentence'; button.dataset.segment = i; button.textContent = segment.text + ' ';
        button.addEventListener('click', () => { audio.currentTime = segment.start; audio.play().catch(error => showError(error.message)); }); p.append(button);
      });
    } else p.textContent = turn.text;
    body.append(header, p);
    const refs = document.createElement('button'); refs.className = 'page-ref'; refs.textContent = `${result?.source.referenceLabel || 'Source'} ${turn.pages.join(', ')}`;
    refs.disabled = !segments;
    refs.addEventListener('click', async () => {
      if (body.querySelector('.source-excerpt')) { body.querySelector('.source-excerpt').remove(); return; }
      try {
        source ||= await api(`/api/jobs/${currentJob}/source.json`);
        const excerpt = document.createElement('div'); excerpt.className = 'source-excerpt';
        excerpt.textContent = turn.pages.map(n => `${source.referenceLabel} ${n}\n${source.pages.find(p => p.page === n)?.text || '(No extracted text)'}`).join('\n\n'); body.append(excerpt);
      } catch (error) { showError(error.message); }
    });
    body.append(refs); row.append(avatar, body); $('transcript').append(row);
  }
}
function showEpisode(job) {
  activeSentence = -1;
  const base = `/api/jobs/${job.id}`; $('episode').hidden = false;
  $('episode-title').textContent = result.title;
  $('episode-meta').textContent = `${formatTime(result.duration)} · Maya & Leo · ${result.source.name}`;
  audio.src = `${base}/podcast.wav`;
  $('download-audio').href = `${base}/podcast.wav?download`; $('download-transcript').href = `${base}/transcript.json?download`; $('download-vtt').href = `${base}/transcript.vtt?download`;
  renderTranscript(result.turns, result.segments);
  fetch(`${base}/podcast.wav`).then(r => r.arrayBuffer()).then(buffer => {
    const data = new DataView(buffer); const count = (buffer.byteLength - 44) / 2; const bars = 100;
    amplitudes = Array.from({ length: bars }, (_, i) => {
      const start = Math.floor(i * count / bars); const end = Math.floor((i + 1) * count / bars); let squares = 0; let n = 0;
      for (let j = start; j < end; j += 20) { squares += (data.getInt16(44 + j * 2, true) / 32768) ** 2; n++; }
      return Math.sqrt(squares / Math.max(n, 1));
    }); drawWave();
  }).catch(() => {});
}
function drawWave() {
  const canvas = $('waveform'); const width = canvas.clientWidth; if (!width) return;
  const ratio = window.devicePixelRatio || 1; canvas.width = width * ratio; canvas.height = 72 * ratio;
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  const peak = Math.max(...amplitudes, 0.01);
  amplitudes.forEach((a, i) => { const height = Math.max(3, a / peak * 58); ctx.fillStyle = i / amplitudes.length <= audio.currentTime / result.duration ? '#bce9ab' : '#4a6043'; ctx.fillRect(i * width / amplitudes.length, (72 - height) / 2, Math.max(1, width / amplitudes.length - 3), height); });
}
function updatePlayback() {
  if (!result) return;
  const index = result.segments.findIndex(s => audio.currentTime >= s.start && audio.currentTime < s.end);
  if (index !== activeSentence) {
    document.querySelector('.sentence.current')?.classList.remove('current'); document.querySelector('.turn.active')?.classList.remove('active');
    const sentence = document.querySelector(`[data-segment="${index}"]`); sentence?.classList.add('current'); const row = sentence?.closest('.turn'); row?.classList.add('active');
    // Scroll only the transcript container; keep the audio controls in view.
    if (row && !audio.paused) { const container = $('transcript'); const top = row.offsetTop - container.offsetTop; if (top < container.scrollTop || top + row.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTo({ top: Math.max(0, top - 20), behavior: 'smooth' }); }
    activeSentence = index;
  }
  drawWave();
}
function animatePlayback() { updatePlayback(); if (!audio.paused && !audio.ended) playbackFrame = requestAnimationFrame(animatePlayback); }
audio.addEventListener('play', () => { cancelAnimationFrame(playbackFrame); animatePlayback(); });
audio.addEventListener('pause', () => { cancelAnimationFrame(playbackFrame); updatePlayback(); });
audio.addEventListener('timeupdate', () => { if (audio.paused || audio.ended) updatePlayback(); });
audio.addEventListener('seeked', updatePlayback);
window.addEventListener('resize', drawWave);
try {
  const job = await api('/api/latest');
  if (job) { currentJob = job.id; startTime = Date.parse(job.createdAt || '') || Date.now(); update(job); if (job.status === 'running') pollTimer = setTimeout(poll, 900); }
} catch { showError('Cannot reach the local engine. Run npm start and reload this page.'); }
