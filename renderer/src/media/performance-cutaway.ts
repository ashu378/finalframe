import { readFile, stat, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createActionMediaTools } from './action-window.js';
import { ACTION_WINDOW_MAX_BYTES } from './action-window-contract.js';

import { selectCutawayFrames, type CutawayRange } from './performance-cutaway-contract.js';
export { selectCutawayFrames } from './performance-cutaway-contract.js';

const input = (file: string) => ['-threads','1','-protocol_whitelist','file,pipe','-f','mov','-enable_drefs','0','-i',file];
const common = ['-v','error','-nostdin','-n','-filter_complex_threads','1'];

export async function composePerformanceCutaway(directory: string, sourcePath: string, donorPath: string,
  recordingPath: string, range: CutawayRange) {
  const selectedDonorFrames = selectCutawayFrames(range);
  const tools = createActionMediaTools({},true);
  const source = await tools.probe(sourcePath);
  const donor = await tools.probe(donorPath);
  if (source.frames > 360 || donor.frames > 360 || source.fps !== 24 || donor.fps !== 24 ||
      source.width !== donor.width || source.height !== donor.height ||
      Math.min(source.width,source.height) > 720 || Math.max(source.width,source.height) > 1280 ||
      range.targetEndFrame > source.frames || range.donorEndFrame > donor.frames) {
    throw new Error('CUTAWAY_MEDIA_TIMING_INVALID');
  }
  const audioProbe = await tools.run('ffprobe', ['-v','error','-protocol_whitelist','file,pipe','-f','mov','-enable_drefs','0',
    '-select_streams','a','-show_entries','stream=codec_name,channels,start_time,duration',
    '-of','json',recordingPath]);
  const audio = JSON.parse(audioProbe.stdout).streams;
  if (audio?.length !== 1 || audio[0].codec_name !== 'aac' ||
      ![1,2].includes(audio[0].channels) || !Number.isFinite(Number(audio[0].start_time)) ||
      Math.abs(Number(audio[0].start_time)) > 0.000002 ||
      !Number.isFinite(Number(audio[0].duration)) || Math.abs(Number(audio[0].duration) - source.duration) > 1 / 24) {
    throw new Error('CUTAWAY_RECORDING_MISMATCH');
  }
  const output = join(directory,'cutaway.mp4');
  const selection = "select='" + selectedDonorFrames.map(n => 'eq(n,'+n+')').join('+') + "',settb=1/24,setpts=N";
  const filters: string[] = [], labels: string[] = [];
  if (range.targetStartFrame) {
    filters.push('[0:v]trim=end_frame='+range.targetStartFrame+',setpts=PTS-STARTPTS[before]');
    labels.push('[before]');
  }
  filters.push('[1:v]'+selection+'[insert]'); labels.push('[insert]');
  if (range.targetEndFrame < source.frames) {
    filters.push('[0:v]trim=start_frame='+range.targetEndFrame+',setpts=PTS-STARTPTS[after]');
    labels.push('[after]');
  }
  filters.push(labels.join('')+'concat=n='+labels.length+':v=1:a=0[out]');
  // Copy independently decodable H.264 segments when their boundaries permit
  // it, encoding only the insert with the ordinary browser-compatible profile.
  // A decoded checksum comparison catches open GOPs at either splice.
  const canCopy = source.codec === 'h264' && [range.targetStartFrame,range.targetStartFrame-1].some(n=>source.keyframes.includes(n)) &&
    (range.targetEndFrame === source.frames || source.keyframes.includes(range.targetEndFrame));
  let copied = false;
  if (canCopy) {
    const segments: string[] = [];
    const segment = (name: string,count: number) => {
      segments.push("file '"+name+".mp4'\nduration "+(count/24).toFixed(9)+"\n");
      return join(directory,name+'.mp4');
    };
    if (range.targetStartFrame) {
      await tools.ffmpeg([...common,...input(sourcePath),'-map','0:v:0','-an','-c','copy',
        '-bsf:v', "noise=drop='gte(pts*tb,"+((range.targetStartFrame-0.25)/24)+")'",
        segment('before',range.targetStartFrame)]);
    }
    await tools.ffmpeg([...common,...input(donorPath),'-vf',selection,'-map','0:v:0','-an','-r','24',
      '-c:v','libx264','-threads','1','-profile:v','high','-crf','12','-preset','medium','-pix_fmt','yuv420p',
      segment('insert',selectedDonorFrames.length)]);
    if (range.targetEndFrame < source.frames) {
      await tools.ffmpeg([...common,'-ss',String(range.targetEndFrame/24),...input(sourcePath),'-map','0:v:0','-an',
        '-c','copy',segment('after',source.frames-range.targetEndFrame)]);
    }
    const list=join(directory,'cutaway.ffconcat');
    await writeFile(list,segments.join(''),{flag:'wx'});
    await tools.ffmpeg([...common,'-f','concat','-safe','1','-protocol_whitelist','file,pipe','-i',list,...input(recordingPath),
      '-map','0:v:0','-map','1:a:0','-c','copy','-fs',String(ACTION_WINDOW_MAX_BYTES),'-movflags','+faststart',output]);
    const frameHashes = async (path: string) => (await tools.ffmpeg(['-v','error',...input(path),
      '-map','0:v:0','-threads','1','-f','framemd5','-'])).stdout.split('\n').filter(s => /^0,/.test(s)).map(s=>s.split(',').at(-1)?.trim());
    const before=await frameHashes(sourcePath), after=await frameHashes(output);
    copied=before.length===source.frames && after.length===source.frames && before.every((hash,i)=>
      i>=range.targetStartFrame&&i<range.targetEndFrame || hash===after[i]);
    if (!copied) await unlink(output);
  }
  if (!copied) {
    // An arbitrary window inside a prediction group cannot be safely spliced.
    // Use the established pixel-lossless action repair encoding for that case.
    await tools.ffmpeg([...common,...input(sourcePath),...input(donorPath),...input(recordingPath),
      '-filter_complex',filters.join(';'),'-map','[out]','-map','2:a:0','-c:a','copy',
      '-c:v','libx264','-threads','1','-preset','veryfast','-crf','0','-pix_fmt','yuv420p',
      '-r','24','-fs',String(ACTION_WINDOW_MAX_BYTES),'-movflags','+faststart',output]);
  }
  if ((await stat(output)).size > ACTION_WINDOW_MAX_BYTES) throw new Error('CUTAWAY_OUTPUT_TOO_LARGE');
  const measured = await tools.probe(output);
  if (measured.fps !== 24 || measured.frames !== source.frames || measured.width !== source.width ||
      measured.height !== source.height || measured.audio.length !== 1) throw new Error('CUTAWAY_OUTPUT_INVALID');
  const packetHash = async (file: string) => (await tools.ffmpeg(['-v','error',...input(file),
    '-map','0:a:0','-c:a','copy','-f','hash','-hash','sha256','-'])).stdout.trim();
  const hash = await packetHash(recordingPath);
  if (!/^SHA256=[0-9a-f]{64}$/.test(hash) || await packetHash(output) !== hash) throw new Error('CUTAWAY_RECORDING_CHANGED');
  return { bytes: await readFile(output), proof: { version:'PERFORMANCE_CUTAWAY_V1' as const, ...range,
    selectedDonorFrames, sourceFrames:source.frames, donorFrames:donor.frames, outputFrames:measured.frames,
    width:source.width, height:source.height, fps:24 as const, originalAudioCopied:true as const }};
}
