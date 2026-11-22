import assert from 'node:assert/strict';
import { assertActionRegionProof } from '../dist/media/action-region-contract.js';
import { planActionWindow } from '../dist/media/action-window-contract.js';
const window = planActionWindow([{startSeconds:4.79,endSeconds:7.25}], {width:864,height:480,videoTiming:{version:'DECODED_VIDEO_FRAMES_V1',fpsNumerator:24,fpsDenominator:1,firstFrameSeconds:0,frameCount:193}});
const region = {version:'ACTION_REGION_V1',mode:'STATIONARY_RECTANGLE',window,x:320,y:64,width:256,height:256};
const sorted = value => value && typeof value==='object' ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sorted(v)])) : value;
for (const compose of [false,true]) {
 const proof={version:'ACTION_REGION_V1',region,width:compose?864:256,height:compose?480:256,fps:24,outputFrames:compose?193:60,originalAudioCopied:compose};
 for(const expected of [region,sorted(region)]) for(const received of [proof,sorted(proof)]) assert.deepEqual(assertActionRegionProof(expected,received,compose),received);
 for(const altered of [{...region,x:322},{...region,y:66},{...region,width:254},{...region,height:254},{...region,window:planActionWindow([{startSeconds:4.75,endSeconds:7.5}], {width:864,height:480,videoTiming:{version:'DECODED_VIDEO_FRAMES_V1',fpsNumerator:24,fpsDenominator:1,firstFrameSeconds:0,frameCount:193}})}]) assert.throws(()=>assertActionRegionProof(sorted(region),sorted({...proof,region:altered}),compose),/BINDING_CHANGED/);
 assert.throws(()=>assertActionRegionProof(sorted(region),sorted({...proof,outputFrames:proof.outputFrames+1}),compose),/BINDING_CHANGED/);
 assert.throws(()=>assertActionRegionProof(sorted(region),sorted({...proof,fps:30}),compose),/BINDING_CHANGED/);
}
console.log('PASS PREPARED/COMPOSED key-order transport round trips; changed coordinates, geometry, timing, frame count and fps remain rejected. No provider calls.');
