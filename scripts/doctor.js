import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { configureRuntime, explainError } from '../lib/runtime.js';

configureRuntime();
console.log(`Densecast · setup check\nNode ${process.version} · ${process.platform}/${process.arch}`);
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 17)) {
  console.error('Node 22.17 or newer is required.'); process.exit(1);
}
console.log(`RAM: ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB total, ${(os.freemem() / 2 ** 30).toFixed(1)} GiB currently free. Recommended: 16 GB total.`);
if (process.platform === 'win32') {
  const result = spawnSync('vulkaninfo', ['--summary'], { encoding: 'utf8', timeout: 20000, windowsHide: true });
  if (result.status === 0) console.log(result.stdout.split('\n').filter(x => /Vulkan Instance Version|apiVersion|deviceName/.test(x)).join('\n'));
  else console.log('vulkaninfo is unavailable. The real worker probe below still tests native startup. Windows requires Vulkan 1.4 and the VC++ x64 runtime.');
}
let sdk;
try {
  sdk = await import('@qvac/sdk');
  const { default: pkg } = await import('@qvac/sdk/package', { with: { type: 'json' } });
  if (pkg.version !== '0.19.1') throw new Error(`Expected @qvac/sdk 0.19.1, found ${pkg.version}. Run npm ci.`);
  for (const name of ['loadModel', 'completion', 'ragIngest', 'ragSearch', 'textToSpeech']) {
    if (typeof sdk[name] !== 'function') throw new Error(`Missing SDK function: ${name}`);
  }
  console.log(`QVAC ${pkg.version}: required functions present. Starting a real Bare worker (no model download)...`);
  const state = await sdk.state();
  console.log(`PASS: worker RPC handshake completed; state=${state}. Run npm start, or npm run test:live for full model inference.`);
} catch (e) {
  console.error(explainError(e)); process.exitCode = 1;
} finally {
  if (sdk) await sdk.close().catch(() => {});
}
