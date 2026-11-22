import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assertProbeUrl } from './remote-probe.js';
import { normalizeSha256, sha256Equal } from './sha256.js';
import { assertFrameToRegion, assertFrameToRegionProof } from './frame-to-region-contract.js';
import { prepareFrameToRegion, composeFrameToRegion } from './action-window.js';
const limit = 50_000_000;
const unavailable = () =>
  Object.assign(new Error('ACTION_WINDOW_WORKER_UNAVAILABLE'), { code: 'ACTION_WINDOW_WORKER_UNAVAILABLE' });
const object = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' ? (v as Record<string, any>) : {};
export async function remoteFrameToRegion(
  value: unknown,
  options: { allowedHosts: readonly string[]; fetch?: typeof fetch },
) {
  const p = object(value),
    contract = assertFrameToRegion(p.frameToRegion);
  if (!['PREPARE', 'COMPOSE'].includes(p.operation)) throw new Error('FRAME_TO_REGION_OPERATION_INVALID');
  const directory = await mkdtemp(join(tmpdir(), 'finalframe-frame-region-'));
  const download = async (input: unknown, name: string) => {
    const media = object(input),
      url = assertProbeUrl(media.url, options.allowedHosts);
    if (
      !normalizeSha256(media.checksum) ||
      !Number.isSafeInteger(media.byteSize) ||
      media.byteSize < 1 ||
      media.byteSize > limit
    )
      throw new Error('FRAME_TO_REGION_SOURCE_INVALID');
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw unavailable();
    }
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      await response.body?.cancel().catch(() => undefined);
      throw unavailable();
    }
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('FRAME_TO_REGION_DOWNLOAD_FAILED');
    }
    const path = join(directory, name),
      file = await open(path, 'wx', 0o600),
      reader = response.body.getReader(),
      hash = createHash('sha256');
    let size = 0;
    try {
      while (true) {
        const next = await reader.read().catch(() => {
          throw unavailable();
        });
        if (next.done) break;
        size += next.value.byteLength;
        if (size > limit) throw new Error('FRAME_TO_REGION_SOURCE_LIMIT');
        hash.update(next.value);
        await file.writeFile(next.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      await file.close();
    }
    if (size !== media.byteSize || !sha256Equal(hash.digest('hex'), media.checksum))
      throw new Error('FRAME_TO_REGION_SOURCE_CHANGED');
    return path;
  };
  try {
    const sourcePath = await download(p.source, 'source.mp4');
    if (p.operation === 'PREPARE') {
      const result = await prepareFrameToRegion({
        sourcePath,
        firstFramePath: join(directory, 'first.png'),
        lastFramePath: join(directory, 'last.png'),
        frameToRegion: contract,
      });
      assertFrameToRegionProof(contract, result.proof, 'PREPARED');
      const encoded = async (frame: typeof result.firstFrame) => {
        const { outputPath, ...proof } = frame;
        return { ...proof, base64: (await readFile(outputPath)).toString('base64') };
      };
      return {
        kind: 'PREPARED' as const,
        proof: result.proof,
        firstFrame: await encoded(result.firstFrame),
        lastFrame: await encoded(result.lastFrame),
      };
    }
    const result = await composeFrameToRegion({
      sourcePath,
      repairPath: await download(p.repair, 'repair.mp4'),
      normalizedPath: join(directory, 'normalized.mp4'),
      outputPath: join(directory, 'composed.mp4'),
      frameToRegion: contract,
    });
    assertFrameToRegionProof(contract, result, 'COMPOSED');
    if ((await stat(result.outputPath)).size > limit) throw new Error('FRAME_TO_REGION_OUTPUT_LIMIT');
    const bytes = await readFile(result.outputPath),
      { outputPath: _path, ...proof } = result;
    return {
      kind: 'COMPOSED' as const,
      bytes,
      proof: { ...proof, checksum: createHash('sha256').update(bytes).digest('hex'), byteSize: bytes.length },
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
