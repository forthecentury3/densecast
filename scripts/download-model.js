import { configureRuntime } from '../lib/runtime.js';

configureRuntime();

const { loadModel, unloadModel, QWEN3_8B_INST_Q4_K_M } = await import('@qvac/sdk');
let modelId;

try {
  console.log('Downloading and caching Qwen3 8B Q4_K_M (about 4.68 GiB)...');
  modelId = await loadModel({
    modelSrc: QWEN3_8B_INST_Q4_K_M,
    modelConfig: { ctx_size: 8192, temp: 0.2, reasoning_budget: 0, 'main-gpu': 'dedicated', gpu_layers: 24 },
    onProgress: progress => {
      process.stdout.write(`\r${progress.percentage.toFixed(0)}%`);
    }
  });
  console.log('\nQwen3 8B is cached. You can now run npm start.');
} finally {
  if (modelId) await unloadModel({ modelId, autoClose: false });
}