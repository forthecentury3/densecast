# Densecast — Dense Document to Podcast

Densecast turns an undergraduate textbook chapter into a conversational, two-speaker study podcast. QVAC runs the language, embedding, and speech models **on your computer**. There are no cloud AI calls, API keys, accounts, or usage charges.

A small Node.js server and a vanilla HTML/CSS/JavaScript page keep setup simple. Open a chapter, click **Synthesize podcast**, and listen with a transcript that follows the generated audio.

## Features

- Drag and drop a searchable PDF or UTF-8 TXT chapter (30 MB, 40 PDF pages, 180,000 characters maximum).
- Read every extracted page in bounded sections instead of silently truncating a long chapter.
- Ground the dialogue in section notes and passages retrieved with QVAC RAG; view the cited source text beside each turn.
- Qwen3 **8B Q4_K_M**, a 5,027,783,488-byte model (5.03 GB / 4.68 GiB), handles the dialogue.
- **Supertonic 3 Q8_0**, with F1 as Maya and M1 as Leo, generates two distinct voices at 44.1 kHz. Ten inference steps prioritize voice quality.
- Generate each sentence from its displayed text. Derive timestamps from the returned PCM samples, including deliberate pauses. Highlight sentences during playback and click a sentence to seek.
- Download one WAV, a transcript JSON with source references and timestamps, and WebVTT captions.
- Real download/generation progress, actionable errors, and recovery of the latest completed podcast after reloading.
- Original teaching sample included. No frontend build step, remote fonts, CDN assets, or database service.

This is a study aid: larger models and source grounding reduce errors but do not guarantee factual accuracy. Citations are model-selected references, not a proof of entailment. Check key claims, especially equations and proofs, against the source. PDF diagrams and scanned pages are not interpreted; use a text-based chapter. English speech is the supported workflow. Transcript synchronization is **sentence-level**, not word-level forced alignment; a TTS model can still mispronounce or omit a word.

## QVAC dependency and SDK functions

`package.json` pins **`"@qvac/sdk": "0.19.1"`** exactly. `package-lock.json` locks the transitive dependencies. Use `npm ci`; do not upgrade to 0.20.x for this submission.

All inference calls are in [`lib/pipeline.js`](lib/pipeline.js):

| Function | Actual use |
| --- | --- |
| `loadModel` | Load EmbeddingGemma 300M, Qwen3 8B, and the two Supertonic 3 voice configurations. First use downloads model weights. |
| `ragIngest` | Embed and index all source passages, preserving page labels. |
| `ragSearch` | Retrieve original passages to ground the dialogue alongside notes from every section. |
| `completion` | Summarize each section and produce a validated, structured two-speaker script. Uses `generationParams` and `final.contentText` from 0.19.1. |
| `textToSpeech` | Synthesize the exact text of each transcript sentence; collect PCM at the explicitly configured 44,100 Hz Supertonic rate. Version 0.19.1 returns `buffer` and `done`; it does not expose the newer `sampleRate` promise. |
| `ragCloseWorkspace` | Remove the temporary retrieval workspace after use. |
| `unloadModel`, `close` | Release models between stages and shut down the worker on completion or failure. |

`npm run doctor` also calls `state()` to test a real worker RPC handshake without downloading a model.

Models: `QWEN3_8B_INST_Q4_K_M`, `EMBEDDINGGEMMA_300M_Q4_0`, and `TTS_MULTILINGUAL_SUPERTONIC3_Q8_0`. These are exports of the installed SDK, not invented model names. The text model alone exceeds 2 GB. It gives this app more language capacity than a tiny model, while batching keeps long inputs within the configured 8,192-token context.

## Requirements

- **Node.js 22.17+ and npm 10.9+**. Node 24 LTS is recommended; the local verification used Node 24.21.0.
- **16 GB RAM recommended**, with memory freed by closing other model apps. This 8B model is not intended for 4 GB machines. CPU mode works more slowly and needs enough free system memory.
- **20 GB free disk recommended** for npm's native packages, downloaded models, temporary download storage, and audio. Model weights total about 5.43 GB. Installation and the first generation need internet; inference itself is local.
- **Windows 10/11 x64:** Vulkan **1.4** loader and current GPU drivers, plus the [Microsoft Visual C++ 2015–2022 x64 Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe). QVAC requires Vulkan on Windows even in CPU mode. If `vulkaninfo` is installed, `vulkaninfo --summary` reports the loader and device versions.
- **Linux:** Ubuntu 22.04 or newer, a current C++ runtime, and `libatomic1`; Vulkan 1.4 for GPU use. On minimal Debian/Ubuntu installations, run `sudo apt update` then `sudo apt install libatomic1 libstdc++6 libvulkan1`. GPU drivers are separate; consult your GPU vendor.
- **macOS:** macOS 14+ on Apple Silicon is the recommended Mac target. See [QVAC system requirements](https://docs.qvac.tether.io/system-requirements/) for supported configurations.

GPU generation defaults to 24 offloaded layers and prefers a dedicated GPU. The embedding and speech stages use CPU for predictable compatibility. Models are unloaded between stages to reduce peak memory. Set `PODCAST_CPU=1` if GPU loading fails (instructions below). Cross-platform source is provided, but only Windows has been exercised in this workspace.

## Install

Download/extract the repository, open a terminal **inside its project folder**, and run:

```sh
node --version
npm --version
npm ci
npm test
npm start
```

`npm ci` installs from the included lockfile; it may take several minutes because QVAC includes native runtimes. Do not omit optional dependencies or copy `node_modules` from another operating system. There is no separate Python worker install step for this JavaScript app.

During installation, leave `npm start` running and open http://127.0.0.1:3000. Choose **Try the included systems analysis chapter**, then click **Synthesize podcast** once. This downloads and caches the QVAC models ahead of regular use; the first generation can take many minutes. Stop the server with **Ctrl+C** after the sample finishes.

`doctor` should finish with `PASS: worker RPC handshake completed`. It verifies installed functions and native worker startup, not the full model pipeline. The startup allowance is 120 seconds. If it fails, use the underlying error printed below the timeout to choose the relevant troubleshooting step.

## Run

```sh
npm start
```

1. Open **http://127.0.0.1:3000** in a current Chrome, Edge, Firefox, or Safari browser.
2. Choose **Try the included systems analysis chapter**, or drop a text-based PDF/TXT file.
3. Click **Synthesize podcast**. Keep the terminal open. Downloads and generation run sequentially; a cold start can take many minutes depending on connection and hardware.
4. When ready, use the audio player's Play button. Highlighted text follows playback; click a sentence to seek. Click a source reference to inspect its extracted page text.
5. Download the WAV, JSON transcript, or VTT captions using the links below the player.

Stop with **Ctrl+C**. One podcast runs at a time. A running job survives a browser refresh, but closing the server stops it. A failed job can be retried after fixing the reported problem. The latest completed result is restored when the app reopens.

### Real inference test

```sh
npm run test:live
```

This makes a short, real two-voice podcast from the included sample using the same three model families and pipeline as the UI. It downloads uncached models and checks that the output WAV, captions, speaker identities, and timestamps agree. It does **not** mock QVAC or substitute a small model. Run it when no other Densecast job is active.

To test your own chapter:

```sh
npm run test:live -- "path/to/chapter.pdf"
```

Generated files are under `.data/jobs/<job-id>/`. A successful live-test report is written to `artifacts/live-test.json`. Open the UI afterwards to play the latest test result. The UI creates a longer dialogue than the brief live-test script.

`npm test` is fast and requires no model downloads. It tests TXT/PDF extraction (including a synthetic 20-page PDF), invalid input, source coverage, script validation, PCM/WAV/VTT calculations, nested RPC errors, and local HTTP serving/range requests. Synthetic fixtures test application mechanics; they are not evidence of AI inference. The separate live test provides that evidence.

## Storage and privacy

The server binds only to `127.0.0.1`, rejects foreign origins/hosts, and serves only explicit app and job output routes. Document text is passed to local QVAC models. No analytics, cloud inference, or browser speech service is used. QVAC can contact its registry/peers to fetch model files.

- Models: QVAC's default `~/.qvac/models` cache (`C:\Users\<you>\.qvac\models` on Windows).
- Documents, extracted source, dialogue, and audio: `.data/jobs/` in this project.
- Temporary RAG workspaces: QVAC's local store; removed after a normal run. A forced process termination can leave a temporary workspace.
- Local verification reports: `artifacts/`.

`.gitignore` excludes these private/generated files and `node_modules`. To remove documents and recordings, stop the app and delete the desired job directory under `.data/jobs`. Do not delete shared QVAC caches or locks while another QVAC application is running. Application code is MIT licensed; downloaded model weights retain their upstream licenses.

## Troubleshooting

### RPC initialization timeout / “RCP INITIALIZATION TIMEOUT ERROR”

The SDK's actual name is **RPC initialization timeout**. It means Node did not complete its handshake with QVAC's Bare worker; a timeout can wrap a missing DLL, native crash, blocked startup, or storage problem. Increasing the wait alone does not repair those causes.

1. Run `npm run doctor` from the project folder. Read **Caused by** and **Worker stderr** in the output. Densecast preserves this information in its UI instead of replacing it with a generic timeout.
2. Verify Node/npm versions and run `npm ci` to restore the exact packages for your platform. Do not mix CLI-generated bundles or 0.20.x files into the 0.19.1 installation; this app uses the SDK's own shipped worker and does not patch `node_modules`.
3. On Windows, update the GPU driver and Vulkan 1.4 runtime, and install/repair Microsoft's VC++ x64 runtime. CPU-only operation still needs the Windows Vulkan loader.
4. On Linux, a `libatomic.so.1` loader error requires `libatomic1`. A `GLIBCXX` error requires a compatible, current C++ runtime/OS. These errors happen before a model loads.
5. If the error says a database is locked, close other QVAC processes normally and retry. Do not blindly delete `.qvac`, lock files, or model caches. If security software reports blocking the bundled runtime, review its specific event with your administrator; do not disable system protection.
6. For legitimately slow storage, the included `qvac.config.json` sets `rpcInitTimeoutMs` to **120000**. `lib/runtime.js` sets the matching environment default **before importing QVAC**. To override it, set `QVAC_RPC_INIT_TIMEOUT_MS` in the same terminal, then restart:

PowerShell:

```powershell
$env:QVAC_RPC_INIT_TIMEOUT_MS = "180000"
npm run doctor
npm start
```

macOS/Linux:

```sh
QVAC_RPC_INIT_TIMEOUT_MS=180000 npm run doctor
QVAC_RPC_INIT_TIMEOUT_MS=180000 npm start
```

Do not run `doctor` while a generation is active. Read the official [QVAC troubleshooting guide](https://docs.qvac.tether.io/troubleshooting/) and [configuration reference](https://docs.qvac.tether.io/configuration/) if the native error remains.

### Out of memory / GPU allocation failure

Close other model apps and memory-heavy applications. To use CPU inference:

```powershell
# PowerShell
$env:PODCAST_CPU = "1"
npm start
```

```sh
# macOS/Linux
PODCAST_CPU=1 npm start
```

The model stays Qwen3 8B; CPU mode does not replace it with a small model. CPU generation is slower. If RAM is insufficient, use a machine with more available memory.

### Download appears stuck

The 8B model is about 5 GB. Progress may pause while QVAC verifies its checksum or loads the model. Check the terminal, free disk, and network connection. The SDK performs bounded download retries. After a reported failure, fix connectivity and retry; successfully cached models are reused. A warm cache avoids downloads, but generation still takes time.

### Empty or scanned PDF / unsupported characters

Use a PDF with selectable text, or export the chapter to UTF-8 TXT. Password-protected PDFs need to be unlocked by their owner. Image-only pages, diagrams, complex table layouts, and unusual equation fonts can extract poorly. The UI reports pages with little extracted text; verify references before relying on the podcast. Files above the limits are rejected with an explanation rather than truncated.

### No audio or incomplete dialogue

Check the displayed error and terminal output. Invalid model JSON is retried once and then rejected. Empty audio fails the job instead of producing silent output. The speech configuration fixes the output to Supertonic's 44,100 Hz native rate, and the WAV header uses that same rate. Click Play manually; browsers generally block autoplay. Sentence highlighting includes the audio model's natural leading/trailing silence and intentionally clears between sentences.

### Port 3000 is busy

Stop the existing server, or use another port:

```powershell
$env:PORT = "3001"
npm start
```

```sh
PORT=3001 npm start
```

Open the exact local URL printed in the terminal. Do not expose this local prototype to the public internet.

## Bounty submission checklist

The supplied bounty requirements include actions outside building this app. **Approval is decided by the bounty reviewer and is not guaranteed.** This project provides the pinned SDK, real on-device function calls, README, original implementation, and MIT license. Before submitting, you still need to:

- Publish your own public GitHub repository with the source, `package-lock.json`, README, and license. Exclude `.data`, `node_modules`, and private textbook files.
- Create **at least three genuine commits authored by you**, reflecting your actual work. No commits or pushes were made as part of preparing this workspace.
- Capture a screenshot or short recording of a successful run showing AI output. Do not present test fixtures or a mock as inference evidence.
- Post on X with your public repository link and tag **@qvac**.
- Submit your repo URL, X post URL, screenshot/recording, and a short app description.

Suggested description:

> Densecast turns a dense textbook chapter into a two-speaker study podcast entirely on-device. It uses QVAC 0.19.1 `loadModel`, `ragIngest`, `ragSearch`, `completion`, and `textToSpeech`, with Qwen3 8B and Supertonic 3.

### A truthful 15-second demo

Download the models and complete a test first. Record dropping a text-heavy PDF and clicking Synthesize (0–4 s), cut to the real generation progress with a visible “time elapsed” label (4–7 s), then play the completed audio while the transcript highlights (7–15 s). Keep a source reference and the model information visible. Generation is not claimed to finish in 15 seconds. A screenshot of the completed player and transcript also satisfies the supplied screenshot-or-recording requirement.

## Project layout

```text
server.js              Local HTTP server and isolated job process
lib/pipeline.js        Real QVAC calls and podcast generation
lib/document.js        PDF/TXT extraction and dialogue validation
lib/audio.js           PCM/WAV and timestamp/caption helpers
lib/runtime.js         Startup configuration and error explanations
public/                Single-page HTML, CSS, and JavaScript
scripts/doctor.js      Real worker startup diagnosis
scripts/live-test.js   Real model pipeline verification
test/                  Fast automated checks and synthetic fixtures
examples/              Original systems analysis sample
qvac.config.json       Startup/download timeout defaults
```

## License

[MIT](LICENSE) for this application and its original teaching sample. QVAC and each model retain their own licenses.
