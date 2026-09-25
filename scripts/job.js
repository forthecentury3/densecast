import { createPodcast } from '../lib/pipeline.js';
import { explainError } from '../lib/runtime.js';

process.once('message', async job => {
  try {
    await createPodcast(job, update => process.send?.({ type: 'progress', ...update }));
    process.exitCode = 0;
  } catch (error) {
    console.error(error);
    process.send?.({ type: 'error', message: explainError(error) });
    process.exitCode = 1;
  } finally { process.disconnect?.(); }
});
