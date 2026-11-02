import { createHash } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);
const root = process.env.FINALFRAME_FIXTURE_MEDIA_DIR || '/tmp/finalframe-fixtures';
const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

async function command(name, args) {
  await exec(name, args, { maxBuffer: 8 * 1024 * 1024 });
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function checksum(file) {
  const bytes = await readFile(file);
  return createHash('sha256').update(bytes).digest('hex');
}

async function probe(file) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name,codec_type,r_frame_rate', '-of', 'json', file]);
  return JSON.parse(stdout);
}

export async function ensureFixtureMedia() {
  await mkdir(root, { recursive: true });
  const video = path.join(root, 'finalframe-fixture.mp4');
  const image = path.join(root, 'finalframe-fixture.png');
  const audio = path.join(root, 'finalframe-fixture.wav');
  if (!(await exists(video))) {
    const draw = (await exists(font))
      ? `drawtext=fontfile=${font}:text='FinalFrame Fixture Scene 1':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2`
      : 'format=yuv420p';
    await command('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0x0b1020:s=640x360:r=30', '-vf', draw, '-t', '2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video]);
  }
  if (!(await exists(image))) await command('ffmpeg', ['-y', '-i', video, '-frames:v', '1', '-update', '1', image]);
  if (!(await exists(audio))) await command('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=2', '-c:a', 'pcm_s16le', audio]);
  const files = [
    { path: image, name: 'FinalFrame fixture still', role: 'IMAGE', mimeType: 'image/png' },
    { path: video, name: 'FinalFrame fixture short video', role: 'VIDEO', mimeType: 'video/mp4', durationSeconds: 2, width: 640, height: 360 },
    { path: audio, name: 'FinalFrame fixture tone', role: 'AUDIO', mimeType: 'audio/wav', durationSeconds: 2 },
  ];
  const output = [];
  for (const file of files) {
    const info = await stat(file.path);
    output.push({ ...file, size: info.size, checksum: await checksum(file.path), probe: await probe(file.path) });
  }
  return { root, files: output };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(await ensureFixtureMedia(), null, 2));
