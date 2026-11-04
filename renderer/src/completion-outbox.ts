import type {GraphicsCertificate} from './templates/graphics-v2-certificate.js';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { RenderReceiptStore, RenderResult } from './renderer.js';
import { createCallbackBody } from './contracts/callback.js';
import { outputFormatForMimeType, type RenderOutputMimeType } from './output-format.js';
import { renderUploadArtifact, RenderStorageUploadRejected } from './worker-transfer.js';
import type { RenderUploadRenewal } from './contracts/upload-renewal.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

async function privateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const entry = await lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Worker state directory must be a local private directory.');
  await chmod(path, 0o700);
}

/** Atomic, owner-only state. Transfer URLs are bearer capabilities; never log
 * these records, and mount their directory on persistent worker storage. */
async function writePrivateJson(path: string, value: unknown) {
  await privateDirectory(dirname(path));
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); }
  finally { await file.close(); }
  try {
    await rename(temporary, path);
    const directory = await open(dirname(path), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await rm(temporary, { force: true }); }
}

async function readPrivateJson<T>(path: string): Promise<T | null> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 512 * 1024) throw new Error('Invalid worker state record.');
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('Worker state record could not be read.');
  }
}

export class FileRenderReceiptStore implements RenderReceiptStore {
  constructor(private readonly root: string) {}
  async get(key: string) {
    const receipt = await readPrivateJson<{ version: number; key: string; result: RenderResult }>(join(this.root, `${digest(key)}.json`));
    if (!receipt) return null;
    if (receipt.version !== 1 || receipt.key !== digest(key) || !receipt.result) throw new Error('Worker render receipt does not match its request.');
    return receipt.result;
  }
  put(key: string, result: RenderResult) { return writePrivateJson(join(this.root, `${digest(key)}.json`), { version: 1, key: digest(key), result }); }
}

export interface CompletionRequest {
  jobId: string;
  leaseId: string;
  attempt: number;
  projectId: string;
  manifestId: string;
  idempotencyKey: string;
  callbackUrl: string;
  storageUploadUrl: string;
  rendererVersion: string;
  heartbeatUrl?: string;
  durationInFrames?: number;
  mimeType?: RenderOutputMimeType;
  graphicsCertificate?: GraphicsCertificate;
  movieContext?: {movieVersionId:string;movieExportId:string;planHash:string};
}

export interface CompletionRecord {
  version: 1;
  key: string;
  fingerprint: string;
  request: CompletionRequest;
  stage: 'RENDERING' | 'UPLOAD_PENDING' | 'CALLBACK_PENDING' | 'DELIVERED' | 'NEEDS_ATTENTION';
  result?: RenderResult;
  storageId?: string;
  uploadRenewal?: { byteSize: number; checksum: string; uploadUrl?: string };
  callbackBody?: string;
  createdAt: number;
  updatedAt: number;
  nextAttemptAt: number;
  transferAttempts: number;
}

export interface CompletionOutboxOptions {
  root: string;
  outputRoot: string;
  upload: (request: CompletionRequest, result: RenderResult, checksum?: string) => Promise<string>;
  renewUpload?: (original: CompletionRequest, request: RenderUploadRenewal) => Promise<string>;
  callback: (request: CompletionRequest, exactBody: string) => Promise<void>;
  receipts: RenderReceiptStore;
  keepOutput?: boolean;
  now?: () => number;
  onPending?: (record: CompletionRecord) => void;
  onDelivered?: (record: CompletionRecord) => void;
  onAttention?: (record: CompletionRecord) => void;
}

/** Rendering and finishing are separate durable stages. A failed callback
 * leaves its exact body/event ID and uploaded storage ID ready for replay. */
export class CompletionOutbox {
  private readonly active = new Map<string, Promise<CompletionRecord>>();
  private draining?: Promise<void>;
  private transferTail: Promise<unknown> = Promise.resolve();
  constructor(private readonly options: CompletionOutboxOptions) {}
  private now() { return this.options.now?.() ?? Date.now(); }
  private path(key: string) { return join(this.options.root, `${key}.json`); }
  private async save(record: CompletionRecord) { await writePrivateJson(this.path(record.key), record); }

  async begin(request: CompletionRequest, payload: unknown): Promise<CompletionRecord> {
    const format = outputFormatForMimeType(request.mimeType);
    if (request.movieContext && format.mimeType !== 'video/mp4') throw new Error('Movie completion requires MP4.');
    const key = digest(`${request.jobId}:${request.leaseId}`);
    const fingerprint = digest(JSON.stringify(payload));
    const previous = await readPrivateJson<CompletionRecord>(this.path(key)) ?? await readPrivateJson<CompletionRecord>(this.path(key).replace(/\.json$/, '.done.json'));
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error('RENDER_REQUEST_CONFLICT');
      return previous;
    }
    const timestamp = this.now();
    const record: CompletionRecord = { version: 1, key, fingerprint, request: { ...request,...(request.graphicsCertificate?{graphicsCertificate:JSON.parse(JSON.stringify(request.graphicsCertificate)) as GraphicsCertificate}:{}) }, stage: 'RENDERING', createdAt: timestamp, updatedAt: timestamp, nextAttemptAt: timestamp, transferAttempts: 0 };
    await this.save(record);
    this.options.onPending?.(record);
    return record;
  }

  async rendered(record: CompletionRecord, result: RenderResult) {
    const updated: CompletionRecord = { ...record, result, stage: 'UPLOAD_PENDING', updatedAt: this.now() };
    await this.save(updated);
    this.options.onPending?.(updated);
    return updated;
  }

  async failed(record: CompletionRecord, failure?:{code:string;message:string;retryable:boolean}) {
    const updated: CompletionRecord = { ...record, stage: 'CALLBACK_PENDING', callbackBody: this.callbackBody(record, 'render.failed',failure), updatedAt: this.now() };
    await this.save(updated);
    this.options.onPending?.(updated);
    return updated;
  }

  private callbackBody(record: CompletionRecord, eventType: 'render.completed' | 'render.failed', failure?:{code:string;message:string;retryable:boolean}) {
    const movie = record.request.movieContext;
    const proof = record.result?.verification;
    const movieProof = proof ? {checkedBy:proof.checkedBy,checkedAt:proof.checkedAt,fileSizeBytes:proof.fileSizeBytes,width:proof.width,height:proof.height,fps:proof.fps,durationSeconds:proof.durationSeconds,videoCodec:proof.videoCodec,...(proof.audioCodec?{audioCodec:proof.audioCodec}:{}),hasAudio:proof.hasAudio,orderedPartIds:proof.orderedItemIds,durationInFrames:record.result!.durationInFrames} : undefined;
    return createCallbackBody({ eventId: randomUUID(), idempotencyKey: record.request.idempotencyKey, jobId: record.request.jobId, projectId: record.request.projectId, rendererVersion: record.request.rendererVersion, attempt: record.request.attempt, eventType,
      payload: eventType === 'render.completed'
        ? { ...(record.request.graphicsCertificate?{graphicsCertificate:record.request.graphicsCertificate}:{}), storageId: record.storageId, leaseId: record.request.leaseId, mimeType: outputFormatForMimeType(record.request.mimeType).mimeType, durationInFrames: record.result!.durationInFrames, ...(movie?{...movie,checksum:record.result!.checksum,verification:movieProof}:record.uploadRenewal?{checksum:record.uploadRenewal.checksum}:{}) }
        : { ...(record.request.graphicsCertificate?{graphicsCertificate:record.request.graphicsCertificate}:{}),leaseId: record.request.leaseId, errorCode: failure?.code??'RENDER_FAILED', errorMessage: failure?.message??'The renderer could not complete this export.', retryable: failure?.retryable??true, ...(movie??{}) },
    });
  }

  deliver(record: CompletionRecord): Promise<CompletionRecord> {
    const running = this.active.get(record.key);
    if (running) return running;
    const operation = this.transferTail.then(() => this.deliverOnce(record)).finally(() => { this.active.delete(record.key); });
    this.transferTail = operation.catch(() => undefined);
    this.active.set(record.key, operation);
    return operation;
  }

  private async deliverOnce(input: CompletionRecord): Promise<CompletionRecord> {
    let record = await readPrivateJson<CompletionRecord>(this.path(input.key)) ?? input;
    if (record.stage === 'RENDERING') return record;
    if (record.stage === 'DELIVERED') { await this.finishAcknowledged(record); return record; }
    if (record.stage === 'NEEDS_ATTENTION') return record;
    if (this.now() - record.createdAt >= 2 * 60 * 60 * 1000) {
      record = { ...record, stage: 'NEEDS_ATTENTION', updatedAt: this.now() };
      await this.save(record);
      this.options.onAttention?.(record);
      return record;
    }
    try {
      if (record.stage === 'UPLOAD_PENDING') {
        if (!record.result) throw new Error('Worker finishing record has no verified artifact.');
        let storageId: string | undefined;
        let proof: { byteSize: number; checksum: string } | undefined;
        if (!record.uploadRenewal) {
          try { storageId = await this.options.upload(record.request, record.result); }
          catch (error) {
            // Convex rejects an expired Storage upload token before reading the body.
            if (!this.options.renewUpload || !(error instanceof RenderStorageUploadRejected) || error.status !== 401) throw error;
            if (!await this.recoverableReceipt(record, record.result)) throw new Error('Retained upload artifact is unavailable.');
            proof = await renderUploadArtifact(record.result.outputPath);
            if (record.request.movieContext && Buffer.from(proof.checksum, 'base64').toString('hex') !== record.result.checksum) throw new Error('Retained movie upload checksum changed.');
            record = { ...record, uploadRenewal: proof, updatedAt: this.now() };
            await this.save(record);
          }
        }
        if (!storageId) {
          const renewal = record.uploadRenewal;
          if (!renewal || !this.options.renewUpload) throw new Error('Renderer upload renewal is unavailable.');
          const result = record.result!;
          if (!proof) {
            if (!await this.recoverableReceipt(record, result)) throw new Error('Retained upload artifact is unavailable.');
            proof = await renderUploadArtifact(result.outputPath);
          }
          if (proof.checksum !== renewal.checksum || proof.byteSize !== renewal.byteSize) throw new Error('Retained upload artifact changed.');
          const request = record.request;
          const uploadUrl = renewal.uploadUrl ?? await this.options.renewUpload(request, {
            jobId: request.jobId, projectId: request.projectId, leaseId: request.leaseId, attempt: request.attempt,
            idempotencyKey: request.idempotencyKey, identity: request.movieContext?.planHash ?? request.manifestId,
            mimeType: outputFormatForMimeType(request.mimeType).mimeType, byteSize: proof.byteSize, checksum: proof.checksum,
          });
          if (!renewal.uploadUrl) {
            record = { ...record, uploadRenewal: { ...renewal, uploadUrl }, updatedAt: this.now() };
            await this.save(record);
          }
          storageId = await this.options.upload({ ...request, storageUploadUrl: uploadUrl }, result, proof.checksum);
        }
        record = { ...record, storageId, stage: 'CALLBACK_PENDING', updatedAt: this.now() };
        record.callbackBody = this.callbackBody(record, 'render.completed');
        // Persist the upload receipt and exact callback before any callback IO.
        await this.save(record);
      }
      if (!record.callbackBody) throw new Error('Worker completion record has no callback receipt.');
      await this.options.callback(record.request, record.callbackBody);
      record = { ...record, stage: 'DELIVERED', updatedAt: this.now() };
      await this.save(record);
      await this.finishAcknowledged(record);
      return record;
    } catch {
      const attempts = record.transferAttempts + 1;
      record = { ...record, transferAttempts: attempts, updatedAt: this.now(), nextAttemptAt: this.now() + Math.min(300_000, 15_000 * attempts) };
      await this.save(record);
      // Capability URLs and transport errors must not reach public logs.
      return record;
    }
  }

  private async finishAcknowledged(record: CompletionRecord) {
    this.options.onDelivered?.(record);
    await this.cleanupArtifact(record);
    // Keep an idempotency tombstone, without now-unused bearer URLs. Pending
    // records/artifacts are never removed by age or by a failed transfer.
    const tombstone = { ...record, request: { ...record.request, callbackUrl: '', storageUploadUrl: '', heartbeatUrl: undefined }, callbackBody: undefined, uploadRenewal: undefined };
    await writePrivateJson(this.path(record.key).replace(/\.json$/, '.done.json'), tombstone);
    await rm(this.path(record.key), { force: true });
  }

  private async cleanupArtifact(record: CompletionRecord) {
    if (this.options.keepOutput || !record.result || !record.storageId) return;
    const root = resolve(this.options.outputRoot);
    const output = resolve(record.result.outputPath);
    // Delete only an acknowledged artifact directly within our output root.
    if (dirname(output) === root && output === join(root, `${record.key}.${outputFormatForMimeType(record.request.mimeType).extension}`)) await rm(output, { force: true });
  }

  private async recoverableReceipt(record: CompletionRecord, result: RenderResult | null): Promise<boolean> {
    if (!result || result.jobId !== record.request.jobId || result.manifestId !== record.request.manifestId || result.outputPath !== join(this.options.outputRoot, `${record.key}.${outputFormatForMimeType(record.request.mimeType).extension}`) || (record.request.durationInFrames !== undefined && record.request.durationInFrames !== result.durationInFrames)) return false;
    try {
      const file = await lstat(result.outputPath);
      return file.isFile() && !file.isSymbolicLink() && file.size > 0 && (!result.verification || result.verification.fileSizeBytes === file.size);
    } catch { return false; }
  }

  async recover() {
    await privateDirectory(this.options.root);
    const names = await readdir(this.options.root);
    for (const name of names) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const record = await readPrivateJson<CompletionRecord>(join(this.options.root, name));
      if (!record || record.version !== 1 || `${record.key}.json` !== name) throw new Error('Invalid worker completion record.');
      if (record.stage === 'DELIVERED') { await this.finishAcknowledged(record); continue; }
      if (record.stage === 'NEEDS_ATTENTION') { this.options.onAttention?.(record); continue; }
      this.options.onPending?.(record);
      if (record.stage === 'UPLOAD_PENDING' && !await this.recoverableReceipt(record, record.result ?? null)) { await this.failed(record); continue; }
      if (record.stage !== 'RENDERING') continue;
      const result = await this.options.receipts.get(record.request.idempotencyKey);
      if (await this.recoverableReceipt(record, result)) await this.rendered(record, result!);
      else await this.failed(record);
    }
  }

  drain(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = this.drainOnce().finally(() => { this.draining = undefined; });
    return this.draining;
  }

  private async drainOnce() {
    await privateDirectory(this.options.root);
    for (const name of await readdir(this.options.root)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const record = await readPrivateJson<CompletionRecord>(join(this.options.root, name));
      if (!record || record.stage === 'RENDERING' || record.stage === 'NEEDS_ATTENTION' || record.nextAttemptAt > this.now()) continue;
      await this.deliver(record);
    }
  }
}
