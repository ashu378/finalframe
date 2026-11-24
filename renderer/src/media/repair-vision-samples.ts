import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FFmpegAdapter } from './ffmpeg.js';
import type { DecodedVideoTiming } from './source-audio-contract.js';

export type RepairSampleRequest = { kind: 'CONTEXT'; frame: number } | { kind: 'CANDIDATE' };
export const REPAIR_SAMPLE_STRIDE = 3; // Eight observations per second at 24 fps.

export async function repairVisionSamples(path: string, directory: string, timing: DecodedVideoTiming,
  request: RepairSampleRequest, ffmpeg: FFmpegAdapter, timeoutMs: number) {
  if (!timing || timing.fpsNumerator / timing.fpsDenominator !== 24 || timing.frameCount > 360 ||
      !request || !['CONTEXT','CANDIDATE'].includes(request.kind)) throw new Error('Invalid repair sampling request.');
  const context = request.kind === 'CONTEXT';
  if (context && (!Number.isInteger(request.frame) || request.frame < 0 || request.frame >= timing.frameCount))
    throw new Error('Repair reference frame is outside this clip.');
  const steps = context ? 1 : Math.ceil(timing.frameCount / REPAIR_SAMPLE_STRIDE);
  const sheets = Math.ceil(steps / 8);
  const geometry = context ? '640:640' : '320:240';
  const select = context ? `eq(n\\,${request.frame})` : `not(mod(n\\,${REPAIR_SAMPLE_STRIDE}))`;
  const filter = [`select=${select}`,`scale=${geometry}:force_original_aspect_ratio=decrease`,
    `pad=${geometry}:(ow-iw)/2:(oh-ih)/2`,'setsar=1',...context?[]:['tile=4x2:nb_frames=8']].join(',');
  await ffmpeg.execute(['-hide_banner','-loglevel','error','-nostdin','-threads','1','-filter_threads','1',
    '-protocol_whitelist','file,pipe','-i',path,'-map','0:v:0','-an','-vf',filter,'-fps_mode','vfr',
    '-frames:v',String(sheets),'-c:v','mjpeg','-q:v','6','-threads','1',join(directory,'repair-%02d.jpg')],
    {timeoutMs, maxOutputBytes:8192});
  const images: string[] = [];
  let bytes = 0;
  for (let i=1; i<=sheets; i++) {
    const file = join(directory,`repair-${String(i).padStart(2,'0')}.jpg`);
    const size = (await stat(file)).size;
    if (!size || size > 256_000 || (bytes += size) > 2_000_000) throw new Error('Repair sample images exceed the inspection limit.');
    images.push((await readFile(file)).toString('base64'));
  }
  return { version: 'REPAIR_SAMPLES_V1', kind: request.kind, frameCount: timing.frameCount,
    firstFrame: context ? request.frame : 0, stride: context ? 1 : REPAIR_SAMPLE_STRIDE, images };
}
