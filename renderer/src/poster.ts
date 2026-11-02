/** Portable metadata contract for a poster retained by timeline import. */
import type {PosterSpec,RenderOutputSpec} from './types.js';
import {normalizeSha256} from './media/sha256.js';
export interface ImportedPosterBinding {
  assetId:string;assetChecksum:string;storageId:string;storageChecksum:string;
  byteSize:number;storageMimeType:'image/jpeg'|'image/png'|'image/webp';
  width:number;height:number;mimeType?:'image/jpeg'|'image/png'|'image/webp';
}
function record(value:unknown):Record<string,unknown>|undefined{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;}
const imageTypes=['image/jpeg','image/png','image/webp'];
export function importedOutputAudio(value:unknown):RenderOutputSpec['audio']{
  if(value===undefined)return undefined;
  const audio=record(value);
  if(!audio||Object.keys(audio).length!==2||Object.keys(audio).some(key=>!['sampleRate','channels'].includes(key))||![44100,48000].includes(Number(audio.sampleRate))||typeof audio.sampleRate!=='number'||![1,2].includes(Number(audio.channels))||typeof audio.channels!=='number')throw new Error('Imported audio output must specify supported44100/48000Hz and mono/stereo channels.');
  return {sampleRate:audio.sampleRate as 44100|48000,channels:audio.channels as 1|2};
}
export function posterSpec(value:unknown):PosterSpec{
  const p=record(value);
  if(!p||Object.keys(p).some(key=>!['src','width','height','mimeType','assetId'].includes(key))||typeof p.src!=='string'||!p.src||p.src.length>2048||/[\u0000\r\n]/.test(p.src)||!Number.isSafeInteger(p.width)||Number(p.width)<1||Number(p.width)>7680||!Number.isSafeInteger(p.height)||Number(p.height)<1||Number(p.height)>4320||p.mimeType!==undefined&&(typeof p.mimeType!=='string'||!imageTypes.includes(p.mimeType))||p.assetId!==undefined&&(typeof p.assetId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(p.assetId)))throw new Error('Imported poster requires supported dimensions, media type and a canonical asset binding.');
  return {...p} as unknown as PosterSpec;
}
export function importedPosterBinding(value:unknown):ImportedPosterBinding{
  const p=record(value);
  if(!p||Object.keys(p).some(key=>!['assetId','assetChecksum','storageId','storageChecksum','byteSize','storageMimeType','width','height','mimeType'].includes(key))||typeof p.assetId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(p.assetId)||typeof p.storageId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(p.storageId)||!normalizeSha256(p.assetChecksum)||!normalizeSha256(p.storageChecksum)||!Number.isSafeInteger(p.byteSize)||Number(p.byteSize)<1||(typeof p.storageMimeType!=='string'||!imageTypes.includes(p.storageMimeType)))throw new Error('Imported poster has no valid canonical storage snapshot. Reimport its verified manifest.');
  posterSpec({src:'canonical-poster',width:p.width,height:p.height,...(p.mimeType===undefined?{}:{mimeType:p.mimeType}),assetId:p.assetId});
  if(p.mimeType!==undefined&&p.mimeType!==p.storageMimeType)throw new Error('Imported poster media type changed.');
  return {...p} as unknown as ImportedPosterBinding;
}
