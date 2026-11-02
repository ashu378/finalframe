import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { detectBeats } from './beat-detector.js';

try {
  const bytes = await readFile(String(workerData.inputPath));
  if (bytes.byteLength % 4) throw new Error('Invalid decoded PCM length.');
  const samples = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  parentPort!.postMessage({ result: detectBeats(samples) });
} catch { parentPort!.postMessage({ error: 'BEAT_ANALYSIS_INVALID_AUDIO' }); }
