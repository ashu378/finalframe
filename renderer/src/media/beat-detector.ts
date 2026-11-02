/** Deterministic, local onset/periodicity analysis. This is a conservative
 * heuristic confidence score, not a probability of musical correctness.
 * Method references: https://labrosa.ee.columbia.edu/projects/beattrack/ and
 * https://librosa.org/doc/0.11.0/generated/librosa.onset.onset_strength.html . */
export const BEAT_ANALYSIS_VERSION = 'ff-beat-spectral-flux-v1';
export const BEAT_ANALYSIS_LIMITS = { sampleRate: 16_000, maxDurationSeconds: 600, maxSourceBytes: 64 * 1024 * 1024, maxBeats: 5_000, maxTempoSegments: 128, minBpm: 40, maxBpm: 240 } as const;

export interface BeatTempoSegment { startSeconds: number; endSeconds: number; bpm: number; confidence: number }
export interface BeatAnalysisResult {
  algorithmVersion: typeof BEAT_ANALYSIS_VERSION;
  outcome: 'RELIABLE' | 'AMBIGUOUS' | 'SILENT' | 'NO_GRID';
  durationSeconds: number;
  sampleRate: number;
  beatsSeconds: number[];
  confidence: number;
  tempoBpm?: number;
  tempoSegments?: BeatTempoSegment[];
  reasonCode: 'STRONG_PERIODIC_ONSETS' | 'SILENCE' | 'TOO_SHORT' | 'NO_PERIODIC_ONSETS' | 'TEMPO_AMBIGUITY' | 'VARIABLE_TEMPO' | 'TOO_DENSE';
}

/** Validate worker/cache responses before they become an immutable version. */
export function assertBeatAnalysisResult(value: unknown): BeatAnalysisResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid beat analysis result.');
  const result = value as BeatAnalysisResult;
  const finite = (number: unknown) => typeof number === 'number' && Number.isFinite(number);
  if (result.algorithmVersion !== BEAT_ANALYSIS_VERSION || !['RELIABLE', 'AMBIGUOUS', 'SILENT', 'NO_GRID'].includes(result.outcome) || !finite(result.durationSeconds) || result.durationSeconds <= 0 || result.durationSeconds > BEAT_ANALYSIS_LIMITS.maxDurationSeconds || result.sampleRate !== BEAT_ANALYSIS_LIMITS.sampleRate || !finite(result.confidence) || result.confidence < 0 || result.confidence > 1 || !Array.isArray(result.beatsSeconds) || result.beatsSeconds.length > BEAT_ANALYSIS_LIMITS.maxBeats) throw new Error('Beat analysis exceeds its certified bounds.');
  for (let index = 0; index < result.beatsSeconds.length; index++) if (!finite(result.beatsSeconds[index]) || result.beatsSeconds[index] < 0 || result.beatsSeconds[index] >= result.durationSeconds || index > 0 && result.beatsSeconds[index] <= result.beatsSeconds[index - 1]) throw new Error('Beat times must be strictly increasing inside the source audio.');
  if (result.outcome === 'RELIABLE') {
    if (result.beatsSeconds.length < 5 || result.confidence < 0.7 || !finite(result.tempoBpm) || result.tempoBpm! < BEAT_ANALYSIS_LIMITS.minBpm || result.tempoBpm! > BEAT_ANALYSIS_LIMITS.maxBpm || result.reasonCode !== 'STRONG_PERIODIC_ONSETS') throw new Error('A reliable grid needs sufficient observed beat evidence.');
  } else if (result.beatsSeconds.length || result.tempoBpm !== undefined || result.outcome === 'SILENT' && (result.confidence !== 0 || result.reasonCode !== 'SILENCE')) throw new Error('Unreliable audio cannot claim an automatic beat grid.');
  if (!['STRONG_PERIODIC_ONSETS', 'SILENCE', 'TOO_SHORT', 'NO_PERIODIC_ONSETS', 'TEMPO_AMBIGUITY', 'VARIABLE_TEMPO', 'TOO_DENSE'].includes(result.reasonCode)) throw new Error('Unknown beat analysis reason.');
  if (result.tempoSegments !== undefined) {
    if (!Array.isArray(result.tempoSegments) || result.tempoSegments.length > BEAT_ANALYSIS_LIMITS.maxTempoSegments) throw new Error('Too many tempo segments.');
    let end = 0;
    for (const segment of result.tempoSegments) {
      if (!segment || !finite(segment.startSeconds) || !finite(segment.endSeconds) || segment.startSeconds < end || segment.endSeconds <= segment.startSeconds || segment.endSeconds > result.durationSeconds || !finite(segment.bpm) || segment.bpm < BEAT_ANALYSIS_LIMITS.minBpm || segment.bpm > BEAT_ANALYSIS_LIMITS.maxBpm || !finite(segment.confidence) || segment.confidence < 0 || segment.confidence > 1) throw new Error('Invalid bounded tempo segment.');
      end = segment.endSeconds;
    }
  }
  return result;
}

const FFT_SIZE = 1024;
const HOP = 160; // 10ms observations; decoded source samples remain unchanged.
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const rounded = (value: number, decimals = 3) => Number(value.toFixed(decimals));
function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Reused radix-2 work buffers avoid per-frame FFT allocations. */
class OnsetSpectrum {
  private readonly real = new Float64Array(FFT_SIZE);
  private readonly imaginary = new Float64Array(FFT_SIZE);
  private readonly previous = new Float64Array(FFT_SIZE / 2 + 1);
  private readonly window = Float64Array.from({ length: FFT_SIZE }, (_, index) => 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (FFT_SIZE - 1)));
  private readonly reverse = Uint16Array.from({ length: FFT_SIZE }, (_, index) => {
    let input = index; let reversed = 0;
    for (let bit = 0; bit < 10; bit++) { reversed = reversed * 2 + (input & 1); input >>>= 1; }
    return reversed;
  });
  private readonly cos = Float64Array.from({ length: FFT_SIZE / 2 }, (_, index) => Math.cos(2 * Math.PI * index / FFT_SIZE));
  private readonly sin = Float64Array.from({ length: FFT_SIZE / 2 }, (_, index) => -Math.sin(2 * Math.PI * index / FFT_SIZE));

  flux(samples: Float32Array, center: number): number {
    for (let index = 0; index < FFT_SIZE; index++) {
      const source = center + index - FFT_SIZE / 2;
      this.real[this.reverse[index]] = (source >= 0 && source < samples.length ? samples[source] : 0) * this.window[index];
      this.imaginary[index] = 0;
    }
    for (let size = 2; size <= FFT_SIZE; size *= 2) {
      const half = size / 2; const step = FFT_SIZE / size;
      for (let block = 0; block < FFT_SIZE; block += size) for (let index = 0; index < half; index++) {
        const left = block + index; const right = left + half; const twiddle = index * step;
        const real = this.real[right] * this.cos[twiddle] - this.imaginary[right] * this.sin[twiddle];
        const imaginary = this.real[right] * this.sin[twiddle] + this.imaginary[right] * this.cos[twiddle];
        this.real[right] = this.real[left] - real; this.imaginary[right] = this.imaginary[left] - imaginary;
        this.real[left] += real; this.imaginary[left] += imaginary;
      }
    }
    let flux = 0;
    for (let bin = 3; bin < this.previous.length; bin++) {
      const magnitude = Math.log1p(Math.hypot(this.real[bin], this.imaginary[bin]) * 100 / FFT_SIZE);
      flux += Math.max(0, magnitude - this.previous[bin]); this.previous[bin] = magnitude;
    }
    return flux / this.previous.length;
  }
}

interface Onset { time: number; frame: number; strength: number }
interface Grid { period: number; phase: number; score: number; correlation: number; beats: number[] }

function onsetObservations(samples: Float32Array) {
  const frames = Math.ceil(samples.length / HOP); const flux = new Float64Array(frames); const attacks = new Float64Array(frames);
  const spectrum = new OnsetSpectrum(); let previousRms = 0; let maximum = 0;
  for (let frame = 0; frame < frames; frame++) {
    const start = frame * HOP; let energy = 0;
    for (let index = start; index < Math.min(samples.length, start + HOP); index++) energy += samples[index] ** 2;
    const rms = Math.sqrt(energy / HOP); attacks[frame] = Math.max(0, rms - previousRms); previousRms = rms;
    flux[frame] = spectrum.flux(samples, start); maximum = Math.max(maximum, flux[frame]);
  }
  if (!maximum) return { onsets: [] as Onset[], frames };
  const prefix = new Float64Array(frames + 1); const squares = new Float64Array(frames + 1);
  for (let frame = 0; frame < frames; frame++) { flux[frame] /= maximum; prefix[frame + 1] = prefix[frame] + flux[frame]; squares[frame + 1] = squares[frame] + flux[frame] ** 2; }
  const onsets: Onset[] = [];
  for (let frame = 0; frame < frames; frame++) {
    const value = flux[frame]; const start = Math.max(0, frame - 25); const end = Math.min(frames, frame + 26); const count = end - start;
    const mean = (prefix[end] - prefix[start]) / count; const deviation = Math.sqrt(Math.max(0, (squares[end] - squares[start]) / count - mean ** 2));
    if (value < 0.12 || value <= mean + deviation || frame > 0 && value < flux[frame - 1] || frame + 1 < frames && value <= flux[frame + 1]) continue;
    // Spectral windows anticipate an attack. Refine against the observed
    // waveform envelope without filling quiet/unobserved musical beats.
    let refined = frame; let attack = 0;
    for (let candidate = Math.max(0, frame - 8); candidate <= Math.min(frames - 1, frame + 8); candidate++) if (attacks[candidate] > attack) { attack = attacks[candidate]; refined = candidate; }
    const onset = { time: rounded(refined * HOP / BEAT_ANALYSIS_LIMITS.sampleRate), frame: refined, strength: value };
    const previous = onsets.at(-1);
    if (previous && onset.time - previous.time < 0.1) { if (value > previous.strength) onsets[onsets.length - 1] = onset; }
    else onsets.push(onset);
  }
  return { onsets, frames };
}

function periodicity(onsets: Onset[], frames: number) {
  const envelope = new Float64Array(frames);
  for (const onset of onsets) envelope[onset.frame] = Math.max(envelope[onset.frame], onset.strength);
  const candidates: Array<{ lag: number; correlation: number }> = [];
  const minimum = Math.round(60 * BEAT_ANALYSIS_LIMITS.sampleRate / HOP / BEAT_ANALYSIS_LIMITS.maxBpm);
  const maximum = Math.round(60 * BEAT_ANALYSIS_LIMITS.sampleRate / HOP / BEAT_ANALYSIS_LIMITS.minBpm);
  for (let lag = minimum; lag <= maximum; lag++) {
    let cross = 0; let leftEnergy = 0; let rightEnergy = 0;
    for (let frame = lag + 1; frame < frames - 1; frame++) {
      const left = envelope[frame]; const right = Math.max(envelope[frame - lag - 1], envelope[frame - lag], envelope[frame - lag + 1]);
      cross += left * right; leftEnergy += left * left; rightEnergy += right * right;
    }
    candidates.push({ lag, correlation: leftEnergy && rightEnergy ? clamp(cross / Math.sqrt(leftEnergy * rightEnergy)) : 0 });
  }
  return candidates.filter((candidate, index) => candidate.correlation >= (candidates[index - 1]?.correlation ?? 0) && candidate.correlation >= (candidates[index + 1]?.correlation ?? 0)).sort((a, b) => b.correlation - a.correlation).slice(0, 12);
}

function evaluateGrid(onsets: Onset[], period: number, correlation: number): Grid {
  const tolerance = Math.min(0.08, period * 0.15);
  const weight = onsets.reduce((sum, onset) => sum + onset.strength, 0);
  const phases = onsets.slice().sort((a, b) => b.strength - a.strength).slice(0, 64);
  let best: Grid = { period, phase: 0, score: 0, correlation, beats: [] };
  for (const phase of phases) {
    const matches = onsets.filter(onset => Math.abs(onset.time - phase.time - Math.round((onset.time - phase.time) / period) * period) <= tolerance);
    if (matches.length < 4) continue;
    // Fit timing to observations instead of accumulating a rounded BPM error.
    let sumX = 0; let sumY = 0; let sumXY = 0; let sumXX = 0;
    for (const onset of matches) { const x = Math.round((onset.time - phase.time) / period); sumX += x; sumY += onset.time; sumXY += x * onset.time; sumXX += x * x; }
    const denominator = matches.length * sumXX - sumX * sumX;
    const fittedPeriod = denominator ? (matches.length * sumXY - sumX * sumY) / denominator : period;
    if (fittedPeriod <= 0 || Math.abs(fittedPeriod / period - 1) > 0.08) continue;
    const fittedPhase = (sumY - fittedPeriod * sumX) / matches.length;
    const slots = new Map<number, Onset>();
    for (const onset of onsets) {
      const slot = Math.round((onset.time - fittedPhase) / fittedPeriod);
      if (Math.abs(onset.time - fittedPhase - slot * fittedPeriod) <= tolerance && (!slots.has(slot) || slots.get(slot)!.strength < onset.strength)) slots.set(slot, onset);
    }
    const values = [...slots.values()].sort((a, b) => a.time - b.time);
    if (values.length < 4) continue;
    const first = Math.round((onsets[0].time - fittedPhase) / fittedPeriod); const last = Math.round((onsets.at(-1)!.time - fittedPhase) / fittedPeriod);
    const coverage = clamp(values.length / Math.max(1, last - first + 1));
    const explained = clamp(values.reduce((sum, onset) => sum + onset.strength, 0) / weight);
    const score = 0.35 * correlation + 0.35 * explained + 0.3 * coverage;
    if (score > best.score) best = { period: fittedPeriod, phase: fittedPhase, score, correlation, beats: values.map(onset => onset.time) };
  }
  return best;
}

function localTempoSegments(onsets: Onset[], duration: number): BeatTempoSegment[] {
  const segments: BeatTempoSegment[] = [];
  for (let start = 0; start < duration; start += 6) {
    const end = Math.min(duration, start + 6); const local = onsets.filter(onset => onset.time >= start && onset.time < end);
    const intervals = local.slice(1).map((onset, index) => onset.time - local[index].time).filter(interval => interval >= 60 / BEAT_ANALYSIS_LIMITS.maxBpm && interval <= 60 / BEAT_ANALYSIS_LIMITS.minBpm);
    if (intervals.length < 4) continue;
    const interval = median(intervals); const confidence = clamp(1 - 4 * median(intervals.map(value => Math.abs(value - interval))) / interval);
    if (confidence < 0.8) continue;
    segments.push({ startSeconds: start, endSeconds: end, bpm: rounded(60 / interval, 2), confidence: rounded(confidence) });
  }
  return segments.slice(0, BEAT_ANALYSIS_LIMITS.maxTempoSegments);
}

function supportedBeatRuns(beats: number[], period: number): number[] {
  const runs: number[][] = [];
  for (const beat of beats) {
    const previous = runs.at(-1);
    if (!previous || beat - previous.at(-1)! > period * 2.5) runs.push([beat]); else previous.push(beat);
  }
  // An isolated decoder/noise attack aligned by chance is not evidence of a
  // musical intro or outro. Long rests remain rests; do not synthesize beats.
  return runs.filter(run => run.length >= 3).flat();
}

export function detectBeats(samples: Float32Array, sampleRate = BEAT_ANALYSIS_LIMITS.sampleRate): BeatAnalysisResult {
  if (sampleRate !== BEAT_ANALYSIS_LIMITS.sampleRate || !samples.length || samples.length > sampleRate * BEAT_ANALYSIS_LIMITS.maxDurationSeconds) throw new Error('Beat analysis requires bounded 16kHz mono decoded audio of at most ten minutes.');
  let energy = 0;
  for (const sample of samples) { if (!Number.isFinite(sample) || Math.abs(sample) > 1.001) throw new Error('Beat analysis received invalid PCM samples.'); energy += sample * sample; }
  const durationSeconds = samples.length / sampleRate;
  const result: BeatAnalysisResult = { algorithmVersion: BEAT_ANALYSIS_VERSION, outcome: 'NO_GRID', durationSeconds, sampleRate, beatsSeconds: [], confidence: 0, reasonCode: 'NO_PERIODIC_ONSETS' };
  if (Math.sqrt(energy / samples.length) < 0.0001) return { ...result, outcome: 'SILENT', reasonCode: 'SILENCE' };
  if (durationSeconds < 3) return { ...result, reasonCode: 'TOO_SHORT' };
  const { onsets, frames } = onsetObservations(samples);
  if (onsets.length < 5) return result;
  if (onsets.length > BEAT_ANALYSIS_LIMITS.maxBeats) return { ...result, outcome: 'AMBIGUOUS', reasonCode: 'TOO_DENSE' };
  const segments = localTempoSegments(onsets, durationSeconds);
  const tempos = segments.map(segment => segment.bpm);
  if (tempos.length > 1 && Math.max(...tempos) / Math.min(...tempos) > 1.08) return { ...result, outcome: 'AMBIGUOUS', tempoSegments: segments, reasonCode: 'VARIABLE_TEMPO' };
  const grids = periodicity(onsets, frames).map(candidate => evaluateGrid(onsets, candidate.lag * HOP / sampleRate, candidate.correlation)).sort((a, b) => b.score - a.score);
  const best = grids[0];
  if (!best || best.beats.length < 5) return result;
  const runner = grids.find(grid => Math.abs(grid.period / best.period - 1) > 0.04);
  const separation = runner ? clamp((best.score - runner.score) / 0.15) : 1;
  const confidence = rounded(clamp(best.score * separation));
  const bpm = 60 / best.period;
  const beats = supportedBeatRuns(best.beats.filter(time => time >= 0 && time < durationSeconds), best.period);
  if (confidence < 0.7 || best.correlation < 0.35 || beats.length < 5 || bpm < BEAT_ANALYSIS_LIMITS.minBpm || bpm > BEAT_ANALYSIS_LIMITS.maxBpm) return { ...result, outcome: 'AMBIGUOUS', confidence, tempoSegments: segments, reasonCode: 'TEMPO_AMBIGUITY' };
  return { ...result, outcome: 'RELIABLE', confidence, tempoBpm: rounded(bpm, 2), beatsSeconds: beats.slice(0, BEAT_ANALYSIS_LIMITS.maxBeats), tempoSegments: segments, reasonCode: 'STRONG_PERIODIC_ONSETS' };
}
