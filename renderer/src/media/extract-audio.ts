import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { assertProbeUrl } from './remote-probe.js';
import { normalizeSha256, sha256Equal } from './sha256.js';
import { ChildProcessCommandRunner, type CommandRunner } from './command-runner.js';
import { InjectableFFmpegAdapter, InjectableFFprobeAdapter, type FFmpegAdapter, type FFprobeAdapter } from './ffmpeg.js';
import { AUDIO_EXTRACTION_LIMITS as L, AUDIO_EXTRACTION_PROFILE, assertExtractionSamples, assertExtractedWav, extractionError } from './audio-extraction-contracts.js';

export interface AudioExtractionRequest { url: string; checksum: string; byteSize: number; profile: typeof AUDIO_EXTRACTION_PROFILE; startSample: number; sampleCount: number }
export async function extractCanonicalAudio(value: unknown, options: { allowedHosts: readonly string[]; fetch?: typeof fetch; ffmpeg?: FFmpegAdapter; ffprobe?: FFprobeAdapter; runner?: CommandRunner }) {
  const request = value as AudioExtractionRequest;
  if (!request || request.profile !== AUDIO_EXTRACTION_PROFILE || !normalizeSha256(request.checksum) || !Number.isSafeInteger(request.byteSize) || request.byteSize < 1 || request.byteSize > L.maxSourceBytes) throw extractionError('EXTRACTION_SOURCE_LIMIT');
  assertExtractionSamples(request.startSample,request.sampleCount);
  const url = assertProbeUrl(request.url,options.allowedHosts);
  const directory = await mkdtemp(join(tmpdir(),'finalframe-audio-extraction-'));
  const input = join(directory,'source'), output = join(directory,'audio.wav'), deadline = Date.now() + L.processingTimeoutMs;
  const remaining = (cap: number) => { const ms = deadline - Date.now(); if (ms <= 0) throw extractionError('EXTRACTION_WORKER_UNAVAILABLE'); return Math.min(ms,cap); };
  let sourceResponse: Response | undefined;
  try {
    const response = await (options.fetch ?? fetch)(url,{redirect:'error',signal:AbortSignal.timeout(remaining(30_000))}).catch(()=>{throw extractionError('EXTRACTION_WORKER_UNAVAILABLE');});
    sourceResponse = response;
    if (!response.ok || !response.body) throw extractionError([408,429].includes(response.status)||response.status>=500?'EXTRACTION_WORKER_UNAVAILABLE':'EXTRACTION_SOURCE_UNAVAILABLE');
    if (Number(response.headers.get('content-length')) > L.maxSourceBytes) throw extractionError('EXTRACTION_SOURCE_LIMIT');
    const file = await open(input,'wx',0o600); let size = 0; const hash = createHash('sha256');
    try { const reader = response.body.getReader(); try { for (;;) { const part = await reader.read().catch(()=>{throw extractionError('EXTRACTION_WORKER_UNAVAILABLE');}); if (part.done) break; size += part.value.length; if (size > L.maxSourceBytes || size > request.byteSize) throw extractionError('EXTRACTION_SOURCE_LIMIT'); hash.update(part.value); await file.writeFile(part.value); } } finally { await reader.cancel().catch(()=>undefined); } } finally { await file.close(); }
    if (size !== request.byteSize || !sha256Equal(hash.digest('hex'),request.checksum)) throw extractionError('EXTRACTION_SOURCE_CHANGED');
    const ffprobe = options.ffprobe ?? new InjectableFFprobeAdapter(), ffmpeg = options.ffmpeg ?? new InjectableFFmpegAdapter();
    const metadata = await ffprobe.probe(input,{timeoutMs:remaining(15_000)});
    const video = metadata.streams.find(stream=>stream.codec_type==='video'), audio = metadata.streams.find(stream=>stream.codec_type==='audio');
    if (!['mov,mp4,m4a,3gp,3g2,mj2','matroska,webm'].includes(String(metadata.format?.format_name)) || !video || !audio || !['h264','hevc','vp8','vp9','av1','prores','mpeg4'].includes(String(video.codec_name)) || !['aac','mp3','opus','vorbis','pcm_s16le','pcm_s24le'].includes(String(audio.codec_name))) throw extractionError('EXTRACTION_AUDIO_UNAVAILABLE');
    // Bound both first streams from complete packet responses, never container
    // duration alone. A short video can otherwise hide hours of source audio.
    let metadataBytes=0,packetCount=0;
    const runner=options.runner ?? new ChildProcessCommandRunner();
    async function packetSpan(kind:'v:0'|'a:0') {
      const budget=L.maxProbeBytes-metadataBytes;if(budget<1)throw extractionError('EXTRACTION_SOURCE_LIMIT');
      const result=await runner.run(ffprobe.command,['-v','error','-protocol_whitelist','file,pipe','-select_streams',kind,'-show_packets','-show_entries','packet=pts_time,duration_time:packet_side_data=skip_samples,discard_padding','-of','json',input],{timeoutMs:remaining(20_000),maxOutputBytes:budget});
      metadataBytes+=Buffer.byteLength(result.stdout);if(metadataBytes>=L.maxProbeBytes)throw extractionError('EXTRACTION_SOURCE_LIMIT');
      let parsed:{packets?:Array<{pts_time?:string;duration_time?:string;side_data_list?:Array<{skip_samples?:number;discard_padding?:number}>}>};try{parsed=JSON.parse(result.stdout);}catch{throw extractionError('EXTRACTION_SOURCE_LIMIT');}
      if(!Array.isArray(parsed.packets)||parsed.packets.length<1||(packetCount+=parsed.packets.length)>L.maxVideoPackets)throw extractionError('EXTRACTION_SOURCE_LIMIT');
      let first=Infinity,last=-Infinity;const rate=Number(audio!.sample_rate);if(kind==='a:0'&&(!Number.isSafeInteger(rate)||rate<=0))throw extractionError('EXTRACTION_SOURCE_LIMIT');
      for(const packet of parsed.packets){const pts=Number(packet.pts_time),duration=Number(packet.duration_time);if(!Number.isFinite(pts)||!Number.isFinite(duration)||duration<=0||duration>60)throw extractionError('EXTRACTION_SOURCE_LIMIT');let start=pts,end=pts+duration;
        if(kind==='a:0'){for(const side of packet.side_data_list??[]){const skip=Number(side.skip_samples??0),discard=Number(side.discard_padding??0);if(!Number.isSafeInteger(skip)||!Number.isSafeInteger(discard)||skip<0||discard<0||skip+discard>Math.ceil(duration*rate)+1)throw extractionError('EXTRACTION_SOURCE_LIMIT');start+=skip/rate;end-=discard/rate;}if(end-start<=1/rate)continue;}
        first=Math.min(first,start);last=Math.max(last,end);
      }
      if(!Number.isFinite(first)||!Number.isFinite(last)||last<=first)throw extractionError('EXTRACTION_SOURCE_LIMIT');return{first,last};
    }
    const visual=await packetSpan('v:0'),sound=await packetSpan('a:0'),first=visual.first;
    const sourceDurationSeconds=Math.max(visual.last,sound.last)-Math.min(first,sound.first);
    if (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds <= 0 || sourceDurationSeconds > 60.000001 || !Number.isFinite(Number(video.start_time)) || Math.abs(Number(video.start_time)-first) > 0.000001 || (request.startSample+request.sampleCount)/48000 > visual.last-first+0.000001) throw extractionError('EXTRACTION_SOURCE_LIMIT');
    const start = request.startSample/48000, end = (request.startSample+request.sampleCount)/48000;
    await ffmpeg.execute(['-hide_banner','-loglevel','error','-y','-threads','1','-protocol_whitelist','file,pipe','-copyts','-t','60','-i',input,'-map','0:a:0','-vn','-af',`asetpts=PTS-(${first})/TB,aresample=48000,atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS`,'-ac','2','-ar','48000','-c:a','pcm_s16le','-t','60','-fs',String(L.maxOutputBytes),output],{timeoutMs:remaining(45_000),maxOutputBytes:8192});
    if ((await stat(output)).size > L.maxOutputBytes) throw extractionError('EXTRACTION_OUTPUT_INVALID');
    const bytes = await readFile(output), proof = assertExtractedWav(bytes,request.sampleCount);
    return { bytes, proof: {...proof,sourceDurationSeconds,checksum:createHash('sha256').update(bytes).digest('hex')} };
  } catch (error) {
    if ((error as {details?:{timedOut?:boolean}}).details?.timedOut) throw extractionError('EXTRACTION_WORKER_UNAVAILABLE');
    throw error;
  } finally { await sourceResponse?.body?.cancel().catch(()=>undefined); await rm(directory,{recursive:true,force:true}); }
}
