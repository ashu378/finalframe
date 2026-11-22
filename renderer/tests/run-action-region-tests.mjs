import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareActionRegion, composeActionRegion } from '../dist/media/action-window.js';
import { assertActionRegion } from '../dist/media/action-region-contract.js';
import { planActionWindow } from '../dist/media/action-window-contract.js';
import { InjectableFFmpegAdapter } from '../dist/media/ffmpeg.js';

const root = await mkdtemp(join(tmpdir(), 'finalframe-action-region-'));
const ffmpeg = new InjectableFFmpegAdapter();
const base = ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '1', '-filter_threads', '1'];
const encoding = ['-c:v', 'libx264', '-threads', '1', '-crf', '0', '-pix_fmt', 'yuv420p'];
const run = args => ffmpeg.execute([...base, ...args], { timeoutMs: 20000 });
async function raw(path, name, audio = false) {
  const destination = join(root, name);
  await run(['-i', path, '-map', audio ? '0:a:0' : '0:v:0', ...(audio ? ['-c:a', 'pcm_s16le', '-f', 's16le'] : ['-pix_fmt', 'yuv420p', '-f', 'rawvideo']), destination]);
  return readFile(destination);
}
const timing = { version: 'DECODED_VIDEO_FRAMES_V1', fpsNumerator: 24, fpsDenominator: 1, firstFrameSeconds: 0, frameCount: 72 };
const window = planActionWindow([{ startSeconds: 1, endSeconds: 2 }], { width: 320, height: 240, videoTiming: timing });
const region = { version: 'ACTION_REGION_V1', mode: 'STATIONARY_RECTANGLE', window, x: 64, y: 80, width: 96, height: 96 };
try {
  for (const bad of [{ x: -2 }, { x: 65 }, { width: 95 }, { width: 32 }, { x: 300 }, { height: 240, width: 320, x: 0, y: 0 }, { mode: 'AUTO_TRACK' }, { window: { ...window, startFrame: 1 } }]) {
    assert.throws(() => assertActionRegion({ ...region, ...bad }));
  }
  assert.deepEqual(assertActionRegion(region), region);
  console.log('PASS source-pixel ROI rejects odd chroma alignment, tiny/out-of-bounds/oversized regions, inferred tracking and altered timing');
  const source = join(root, 'source.mp4'), crop = join(root, 'crop.mp4'), patch = join(root, 'patch.mp4'), output = join(root, 'output.mp4');
  await run(['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=523:sample_rate=48000:duration=3.2', ...encoding, '-c:a', 'aac', source]);
  const prepared = await prepareActionRegion({ sourcePath: source, outputPath: crop, region });
  assert.equal(prepared.outputFrames, 24); assert.equal(prepared.originalAudioCopied, false);
  assert.equal(prepared.width, 96); assert.equal(prepared.height, 96);
  await run(['-f', 'lavfi', '-i', 'color=red:size=96x96:rate=24:duration=1', ...encoding, patch]);
  const proof = await composeActionRegion({ sourcePath: source, repairPath: patch, outputPath: output, region });
  assert.equal(proof.outputFrames, 72); assert.equal(proof.originalAudioCopied, true);
  const [sourceBytes, cropBytes, patchBytes, outputBytes] = await Promise.all([raw(source, 'source.yuv'), raw(crop, 'crop.yuv'), raw(patch, 'patch.yuv'), raw(output, 'output.yuv')]);
  const sourceFrameSize = 320 * 240 * 1.5, patchFrameSize = 96 * 96 * 1.5;
  assert.equal(outputBytes.length, sourceBytes.length); assert.equal(cropBytes.length, 24 * patchFrameSize);
  // Check every luma and chroma sample, not a screenshot approximation. All
  // original pixels outside the ROI/window must be byte-identical after decode.
  let changed = 0;
  for (let frame = 0; frame < 72; frame++) {
    let planeOffset = 0, cropOffset = 0;
    for (let plane = 0; plane < 3; plane++) {
      const scale = plane === 0 ? 1 : 2;
      const width = 320 / scale, height = 240 / scale, rw = 96 / scale, rh = 96 / scale;
      const x0 = region.x / scale, y0 = region.y / scale;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const pos = frame * sourceFrameSize + planeOffset + y * width + x;
        const inside = frame >= 24 && frame < 48 && x >= x0 && x < x0 + rw && y >= y0 && y < y0 + rh;
        if (inside) {
          const local = (frame - 24) * patchFrameSize + cropOffset + (y - y0) * rw + x - x0;
          assert.equal(cropBytes[local], sourceBytes[pos], 'prepared crop preserves original samples');
          assert.equal(outputBytes[pos], patchBytes[local], 'selected region contains the repaired samples');
          if (outputBytes[pos] !== sourceBytes[pos]) changed++;
        } else assert.equal(outputBytes[pos], sourceBytes[pos], 'outside sample changed');
      }
      planeOffset += width * height; cropOffset += rw * rh;
    }
  }
  assert(changed > 1000);
  assert.deepEqual(await raw(output, 'output.pcm', true), await raw(source, 'source.pcm', true));
  const audioHash = async path => (await run(['-i', path, '-map', '0:a:0', '-c:a', 'copy', '-f', 'hash', '-hash', 'sha256', '-'])).stdout.trim();
  assert.equal(await audioHash(output), await audioHash(source));
  console.log('PASS prepared crop exact; every outside luma/chroma sample and entire original encoded audio unchanged; only selected region/window replaced');
  await assert.rejects(prepareActionRegion({ sourcePath: source, outputPath: source, region }), /OVERWRITE_SOURCE/);
  await assert.rejects(prepareActionRegion({ sourcePath: source, outputPath: crop, region }), /OUTPUT_EXISTS/);
  await assert.rejects(prepareActionRegion({ sourcePath: source, outputPath: join(root, 'bad-source.mp4'), region: { ...region, window: { ...window, sourceFrames: 73 } } }), /SOURCE_CHANGED/);
  await assert.rejects(composeActionRegion({ sourcePath: source, repairPath: source, outputPath: join(root, 'bad-dimensions.mp4'), region }), /DIMENSIONS_CHANGED/);
  const wrongTime = join(root, 'wrong-time.mp4');
  await run(['-f', 'lavfi', '-i', 'color=blue:size=96x96:rate=24:duration=2', ...encoding, wrongTime]);
  await assert.rejects(composeActionRegion({ sourcePath: source, repairPath: wrongTime, outputPath: join(root, 'bad-time.mp4'), region }), /REPAIR_TIMING_CHANGED/);
  const silent = join(root, 'silent.mp4'), silentOutput = join(root, 'silent-output.mp4');
  await run(['-i', source, '-map', '0:v:0', '-c:v', 'copy', silent]);
  const silentProof = await composeActionRegion({ sourcePath: silent, repairPath: patch, outputPath: silentOutput, region });
  assert.equal(silentProof.originalAudioCopied, false);
  console.log('PASS overwrite, changed source/dimensions/timing rejected; silent source stays silent');
  console.log(JSON.stringify({ providerCalls: 0, pass: true, changedPixelsRequireCreativeReview: true, outsidePixelsExact: true, sourceAudioEncodedExact: true, backendAuthorizationTestedSeparately: true }));
} finally { await rm(root, { recursive: true, force: true }); }
