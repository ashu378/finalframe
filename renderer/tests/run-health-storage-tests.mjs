import assert from 'node:assert/strict';
import { readFile, statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { observeWorkerStorage } from '../dist/health-storage.js';
let groups=0;
const paths={outputRoot:'/private/output-config',stateRoot:'/private/state-config'};
const now=()=>Date.parse('2026-11-05T15:30:00Z');
const GiB=1024n**3n;
{
 const calls=[];const result=await observeWorkerStorage(paths,{now,statfs:async path=>{calls.push(path);return path===paths.outputRoot?{bsize:4096n,bavail:3n*GiB/4096n,blocks:16n*GiB/4096n}:{bsize:1024n,bavail:2n*GiB/1024n,blocks:8n*GiB/1024n};}});
 assert.deepEqual(calls,[paths.outputRoot,paths.stateRoot]);assert.equal(result.version,1);assert.equal(result.basis,'FILESYSTEM_AVAILABLE_BLOCKS');assert.equal(result.quota,'NOT_OBSERVED');assert.equal(result.observedAt,'2026-11-05T15:30:00.000Z');
 assert.deepEqual(result.output,{status:'MEASURED',availableBytes:3*Number(GiB),totalBytes:16*Number(GiB)});assert.equal(result.state.availableBytes,2*Number(GiB));assert.equal(result.minimumAvailableBytes,2*Number(GiB));assert.equal(result.minimumTotalBytes,8*Number(GiB));assert(!JSON.stringify(result).includes('/private/'));groups++;
}
{
 const result=await observeWorkerStorage(paths,{now,statfs:async()=>({bsize:4096n,bavail:1024n,blocks:2048n})});assert.equal(result.minimumAvailableBytes,4096*1024,'Shared filesystems must not be added together');assert.equal(result.minimumTotalBytes,4096*2048);groups++;
}
{
 const result=await observeWorkerStorage(paths,{now,statfs:async path=>{if(path===paths.stateRoot)throw Error('permission denied mount=/private/state-config secret=hidden');return {bsize:4096n,bavail:100n,blocks:200n};}});assert.equal(result.output.status,'MEASURED');assert.deepEqual(result.state,{status:'UNKNOWN',availableBytes:null,totalBytes:null});assert.equal(result.minimumAvailableBytes,null);assert.equal(result.minimumTotalBytes,null);assert(!JSON.stringify(result).includes('hidden'));assert(!JSON.stringify(result).includes('/private'));groups++;
}
{
 for(const row of [{bsize:0n,bavail:1n,blocks:2n},{bsize:1n,bavail:-1n,blocks:2n},{bsize:1n,bavail:3n,blocks:2n},{bsize:4096n,bavail:2n**60n,blocks:2n**61n},{bsize:4096,bavail:1,blocks:2}]){
  const result=await observeWorkerStorage(paths,{now,statfs:async()=>row});assert.equal(result.minimumAvailableBytes,null);assert.equal(result.output.status,'UNKNOWN');
 }
 const zero=await observeWorkerStorage(paths,{now,statfs:async()=>({bsize:4096n,bavail:0n,blocks:200n})});assert.equal(zero.minimumAvailableBytes,0,'Zero capacity is measured zero, never unknown or invented reserve');groups++;
}
{
 const direct=await statfs(tmpdir(),{bigint:true});const actual=await observeWorkerStorage({outputRoot:tmpdir(),stateRoot:tmpdir()});assert.equal(actual.output.status,'MEASURED');assert.equal(actual.output.totalBytes,Number(direct.bsize*direct.blocks));assert(actual.minimumAvailableBytes>=0&&actual.minimumAvailableBytes<=actual.minimumTotalBytes);groups++;
}
{
 const server=await readFile(new URL('../src/server.ts',import.meta.url),'utf8');assert.match(server,/request\.method === 'GET' && request\.url === '\/health'[\s\S]*?storage:await observeWorkerStorage\(\{outputRoot,stateRoot\}\)/);assert.match(server,/sourceAudioVersion:SOURCE_AUDIO_VERSION/);assert.match(server,/formatVariantVersion:FORMAT_VARIANT_VERSION/);groups++;
}
console.log(`Worker storage health: ${groups} groups PASS. Real local statfs and isolated failure/measurement contracts; no provider, online database, shell commands or render operations.`);
