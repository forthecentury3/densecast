import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const DATA = path.resolve(process.env.PODCAST_DATA_DIR || path.join(ROOT, '.data'));

export function configureRuntime() {
  // Set before importing the SDK: the timeout is read before its worker starts.
  process.env.QVAC_CONFIG_PATH ||= path.join(ROOT, 'qvac.config.json');
  process.env.QVAC_RPC_INIT_TIMEOUT_MS ||= '120000';
}

export function explainError(error) {
  const parts = []; let e = error;
  for (let i = 0; e && i < 5; i++, e = e.cause) {
    parts.push(e.message || String(e));
    if (e.stderrTail && !parts.at(-1).includes(e.stderrTail)) parts.push(e.stderrTail);
  }
  const detail = parts.join('\nCaused by: ');
  if (/RPC.*(init|timeout)|worker.*(start|exit)|50204|50207/i.test(detail)) {
    return `${detail}\n\nQVAC worker startup failed. Run npm run doctor. On Windows, check Vulkan 1.4 drivers and Microsoft Visual C++ 2015–2022 x64 Runtime. On Linux, check libatomic1 and libstdc++. Close other QVAC apps if the log says a database is locked. Restart after fixing the cause. A longer timeout cannot repair a missing native library. See README → Troubleshooting.`;
  }
  return detail;
}
