export interface BeatPictureInput { id: string; durationSeconds: number; trimStartSeconds?: number }
export interface BeatCutPlan { boundaryFrames: number[]; beatIndices: number[]; clips: Array<{ clipId: string; startFrame: number; durationInFrames: number; trimStartSeconds: number }>; durationSeconds: number }

/** Allocate observed beats to ordered, trim-only picture ranges. The sliding
 * minimum DP is O(pictures * visible beats), not an unbounded pairwise search. */
export function planBeatCuts(input: { pictures: BeatPictureInput[]; beatsSeconds: number[]; fps: number; audioStartSeconds: number; audioDurationSeconds: number; audioTrimStartSeconds: number; beatIndices?: number[] }): BeatCutPlan {
  const { pictures, fps } = input;
  if (![24,25,30,50,60].includes(fps) || pictures.length < 2 || pictures.length > 200 || !Number.isFinite(input.audioStartSeconds) || Math.abs(input.audioStartSeconds) > 0.000001 || !Number.isFinite(input.audioDurationSeconds) || input.audioDurationSeconds <= 0 || input.audioDurationSeconds > 60 || !Number.isFinite(input.audioTrimStartSeconds) || input.audioTrimStartSeconds < 0 || input.beatsSeconds.length > 5000 || input.beatsSeconds.some((beat,index)=>!Number.isFinite(beat)||beat<0||index>0&&beat<=input.beatsSeconds[index-1])) throw new Error('Choose two to 200 picture clips and a strictly increasing beat map for a soundtrack starting at zero, within the 60-second timeline limit.');
  if (new Set(pictures.map(picture=>picture.id)).size !== pictures.length || pictures.some(picture=>!picture.id || !Number.isFinite(picture.trimStartSeconds??0) || (picture.trimStartSeconds??0)<0)) throw new Error('Choose distinct picture ranges with valid source handles.');
  const end = Math.round(input.audioDurationSeconds * fps);
  const capacities = pictures.map(picture => Math.floor(picture.durationSeconds * fps + 0.000001));
  if (capacities.some(duration => !Number.isFinite(duration) || duration < 1) || capacities.reduce((sum,value)=>sum+value,0) < end) throw new Error('The approved picture ranges cannot cover this soundtrack. Add longer or more approved footage.');
  const mapped = input.beatsSeconds.map((time,index) => ({ frame: Math.round((time - input.audioTrimStartSeconds) * fps), index })).filter(beat => beat.frame > 0 && beat.frame < end);
  let boundaries: number[]; let selected: number[];
  if (input.beatIndices) {
    if (input.beatIndices.length !== pictures.length - 1 || input.beatIndices.some((index,at)=>!Number.isInteger(index)||index<0||index>=input.beatsSeconds.length||at>0&&index<=input.beatIndices![at-1])) throw new Error('Choose one increasing observed beat boundary between each pair of picture clips.');
    selected = input.beatIndices.slice(); boundaries = [0,...selected.map(index => Math.round((input.beatsSeconds[index] - input.audioTrimStartSeconds) * fps)),end];
  } else {
    const unique = mapped.filter((beat,index)=>index===0||beat.frame!==mapped[index-1].frame);
    if (unique.length < pictures.length - 1) throw new Error('There are too few observed beats for this many pictures. Review the beat map or use fewer clips.');
    const frames = [0,...unique.map(beat=>beat.frame),end]; const count = frames.length;
    let previous = new Float64Array(count).fill(Infinity); previous[0]=0;
    const parents: Int32Array[]=[];
    for(let cut=1;cut<pictures.length;cut++) {
      const next=new Float64Array(count).fill(Infinity);const parent=new Int32Array(count).fill(-1);const queue:number[]=[];let head=0;
      for(let at=1;at<count-1;at++) {
        const candidate=at-1;
        if(Number.isFinite(previous[candidate])) { while(queue.length>head&&previous[queue.at(-1)!]>=previous[candidate])queue.pop();queue.push(candidate); }
        while(queue.length>head&&frames[queue[head]]<frames[at]-capacities[cut-1])head++;
        if(queue.length>head){const best=queue[head];next[at]=previous[best]+(frames[at]/end-cut/pictures.length)**2;parent[at]=best;}
      }
      previous=next;parents.push(parent);
    }
    let last=-1;let score=Infinity;
    for(let at=1;at<count-1;at++)if(end-frames[at]>=1&&end-frames[at]<=capacities.at(-1)!&&previous[at]<score){score=previous[at];last=at;}
    if(last<0)throw new Error('Observed beats cannot fit these approved source handles. Review boundaries or choose different footage.');
    const positions:number[]=[];
    for(let cut=pictures.length-2;cut>=0;cut--){positions.unshift(last);last=parents[cut][last];}
    boundaries=[0,...positions.map(at=>frames[at]),end];selected=positions.map(at=>unique[at-1].index);
  }
  const clips=pictures.map((picture,index)=>{
    const duration=boundaries[index+1]-boundaries[index];
    if(!Number.isInteger(boundaries[index])||duration<1||duration>capacities[index]||boundaries[index]<0||boundaries[index+1]>end)throw new Error('A selected beat boundary would extend, reverse or empty an approved source range.');
    return {clipId:picture.id,startFrame:boundaries[index],durationInFrames:duration,trimStartSeconds:picture.trimStartSeconds??0};
  });
  return {boundaryFrames:boundaries,beatIndices:selected,clips,durationSeconds:end/fps};
}
