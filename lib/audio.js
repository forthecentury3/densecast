// The transcript clock is derived from PCM sample counts, never reading speed.
export function pcmToBuffer(samples) {
  if (!samples?.length) throw new Error('The speech model returned no audio. Retry synthesis.');
  if (samples.every(sample => sample === 0)) throw new Error('The speech model returned only silence. Retry synthesis.');
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) throw new Error('Invalid sample returned by the speech model.');
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i]))), i * 2);
  }
  return pcm;
}

export function wavHeader(bytes, sampleRate) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Invalid audio sample rate.');
  const h = Buffer.alloc(44);
  h.write('RIFF'); h.writeUInt32LE(bytes + 36, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36);
  h.writeUInt32LE(bytes, 40);
  return h;
}

export function subtitleTime(seconds) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

export function toVtt(segments) {
  return 'WEBVTT\n\n' + segments.map((s, i) => `${i + 1}\n${subtitleTime(s.start)} --> ${subtitleTime(s.end)}\n${s.speaker}: ${s.text.replaceAll('-->', '→')}\n`).join('\n');
}
