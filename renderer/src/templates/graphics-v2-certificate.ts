/** Portable handshake/signed-completion contract. The worker derives this
 * solely from its frozen request; callers never supply a trusted certificate. */
import {GRAPHICS_V2_TEMPLATE_IDS,type GraphicsV2TemplateId} from './graphics-v2-contract.js';
export const GRAPHICS_CERTIFICATE_ERROR='RENDER_GRAPHICS_CERTIFICATE_INVALID';
export interface GraphicsRequirements {layoutVersion:2;manifestId:string;templateIds:GraphicsV2TemplateId[]}
export interface GraphicsCertificate extends GraphicsRequirements {jobId:string;leaseId:string;attempt:number}
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const invalid=():never=>{throw new Error(GRAPHICS_CERTIFICATE_ERROR);};
export function graphicsRequirements(manifest:unknown):GraphicsRequirements|undefined{
 const raw=record(manifest),items=Array.isArray(raw.items)?raw.items:[],responsive=items.map(record).filter(item=>item.kind==='motion-graphics'&&record(item.props).layoutVersion===2);
 if(!responsive.length)return undefined;
 if(raw.version!==5||typeof raw.manifestId!=='string'||!raw.manifestId||raw.manifestId.length>256||items.length>200)return invalid();
 const ids=responsive.map(item=>item.templateId);if(ids.some(id=>typeof id!=='string'||!(GRAPHICS_V2_TEMPLATE_IDS as readonly string[]).includes(id)))return invalid();
 return {layoutVersion:2,manifestId:raw.manifestId,templateIds:[...new Set(ids as GraphicsV2TemplateId[])].sort()};
}
export function expectedGraphicsCertificate(request:{jobId:string;leaseId:string;attempt:number;manifest:unknown}):GraphicsCertificate|undefined{
 const required=graphicsRequirements(request.manifest);if(!required)return undefined;
 if(typeof request.jobId!=='string'||!request.jobId||request.jobId.length>180||typeof request.leaseId!=='string'||!request.leaseId||request.leaseId.length>512||/[\u0000\r\n]/.test(request.leaseId)||!Number.isSafeInteger(request.attempt)||request.attempt<1||request.attempt>3)return invalid();
 return {...required,jobId:request.jobId,leaseId:request.leaseId,attempt:request.attempt};
}
export function assertGraphicsCertificate(value:unknown,expected:GraphicsCertificate):GraphicsCertificate{
 const raw=record(value),keys=['layoutVersion','manifestId','templateIds','jobId','leaseId','attempt'];
 if(Object.keys(raw).length!==keys.length||Object.keys(raw).some(key=>!keys.includes(key))||raw.layoutVersion!==2||raw.manifestId!==expected.manifestId||raw.jobId!==expected.jobId||raw.leaseId!==expected.leaseId||raw.attempt!==expected.attempt||!Array.isArray(raw.templateIds)||JSON.stringify(raw.templateIds)!==JSON.stringify(expected.templateIds))return invalid();
 return {...expected,templateIds:[...expected.templateIds]};
}
