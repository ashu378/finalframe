/** Image endpoint transport only. A receipt identifies the request; it is not a
 * pollable video job or proof that a final image was delivered. */
export const IMAGE_RESPONSE_LIMITS = { timeoutMs: 180_000, maxJsonBytes: 22 * 1024 * 1024, maxImageBytes: 15 * 1024 * 1024 } as const;
export type ImageResponseBody = { data?: Array<{ b64_json?: string; media_type?: string; url?: string }>; usage?: unknown; model?: string };
export type ImageResponseHooks = {
  onImageReceipt?: (requestId: string, kind: 'GENERATION' | 'CORRELATION') => Promise<void>;
  onImageCompleted?: (body: ImageResponseBody, requestId?: string) => Promise<void>;
};
export function imageReceipt(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value) ? value : undefined;
}
function invalid() { return Object.assign(new Error('Image response is incomplete or invalid.'), { code: 'INVALID_PROVIDER_RESPONSE', retryable: false }); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
/** Strict raster decoding runs before private storage, never on a partial SSE preview. */
export function decodePreparedImage(body: ImageResponseBody) {
  if (body.data?.length !== 1) throw invalid();
  const image = body.data[0], b64 = image.b64_json;
  if (typeof b64 !== 'string' || !b64.length || b64.length > 4 * Math.ceil(IMAGE_RESPONSE_LIMITS.maxImageBytes / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b64)) throw invalid();
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  const jpeg = bytes.length >= 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0,4))==='RIFF' && String.fromCharCode(...bytes.subarray(8,12))==='WEBP';
  const contentType = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : undefined;
  if (!contentType || image.media_type && image.media_type !== contentType || bytes.length > IMAGE_RESPONSE_LIMITS.maxImageBytes) throw invalid();
  return { bytes, contentType };
}
/** Header checkpoint precedes the first body read. SSE completed images are
 * checkpointed before DONE so a lost tail cannot discard already saved bytes. */
export async function readImageResponse(response: Response, hooks: ImageResponseHooks = {}, maxBytes: number = IMAGE_RESPONSE_LIMITS.maxJsonBytes) {
  const headerGenerationId=response.headers.get('x-generation-id');
  let generationId = typeof headerGenerationId==='string' && /^gen-[A-Za-z0-9._-]{1,180}$/.test(headerGenerationId) ? headerGenerationId : undefined;
  const correlationId=imageReceipt(response.headers.get('x-request-id'));
  if (generationId) await hooks.onImageReceipt?.(generationId,'GENERATION');
  if (correlationId) await hooks.onImageReceipt?.(correlationId,'CORRELATION');
  const reader = response.body?.getReader(); if (!reader) throw invalid();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size=0, reads=0, tail='', completed: ImageResponseBody | undefined;
  let pieces:string[]=[];
  const sse = response.headers.get('content-type')?.split(';')[0].trim() === 'text/event-stream';
  async function event(block: string) {
    const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
    if (!data) return false;
    if (data==='[DONE]') { if (!completed) throw invalid(); return true; }
    let parsed: Record<string,unknown>; try { parsed=record(JSON.parse(data)); } catch { throw invalid(); }
    if (parsed.error || parsed.type==='error') throw invalid();
    if (parsed.id !== undefined) { const id=imageReceipt(parsed.id); if (!id || !/^gen-[A-Za-z0-9._-]{1,180}$/.test(id) || generationId && id!==generationId) throw invalid(); if(!generationId){generationId=id;await hooks.onImageReceipt?.(id,'GENERATION');} }
    if (parsed.type==='image_generation.partial_image') { if(completed)throw invalid(); return false; }
    if (parsed.type!=='image_generation.completed' || completed) throw invalid();
    completed={...Object.fromEntries(['cost','cost_usd','cost_details'].filter(key=>parsed[key]!==undefined).map(key=>[key,parsed[key]])),data:[{b64_json:parsed.b64_json as string,media_type:parsed.media_type as string}],...(parsed.usage!==undefined?{usage:parsed.usage}:{}),...(typeof parsed.model==='string'?{model:parsed.model}:{})};
    await hooks.onImageCompleted?.(completed,generationId); return false;
  }
  try {
    for (;;) {
      const next=await reader.read(); if(next.done)break; size+=next.value.byteLength;
      if(++reads>65536 || size>Math.min(maxBytes,IMAGE_RESPONSE_LIMITS.maxJsonBytes))throw invalid();
      const decoded=decoder.decode(next.value,{stream:true});
      if(!sse){pieces.push(decoded);continue;}
      let pending=tail+decoded;tail='';
      for(;;){const boundary=/\r?\n\r?\n/.exec(pending);if(!boundary){const cut=Math.max(0,pending.length-3);pieces.push(pending.slice(0,cut));tail=pending.slice(cut);break;}pieces.push(pending.slice(0,boundary.index));const block=pieces.join('');pieces=[];pending=pending.slice(boundary.index+boundary[0].length);if(await event(block))return{body:completed!,requestId:generationId??correlationId};}
    }
    pieces.push(decoder.decode()); if(sse)throw invalid();
    const text=pieces.join('');
    let body: ImageResponseBody;try{body=JSON.parse(text);}catch{throw invalid();}
    if (!body || typeof body!=='object' || !Array.isArray(body.data) || !body.data.length) throw invalid();
    await hooks.onImageCompleted?.(body,generationId);return{body,requestId:generationId??correlationId};
  } finally { await reader.cancel().catch(()=>undefined); }
}
