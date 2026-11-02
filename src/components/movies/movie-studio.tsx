'use client';

import { useRef, useState } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { EpisodeOption } from '@/lib/production/episode-actions';
import { Button } from '@/components/ui/button';
import { controlInput } from '@/components/production-workspace/resource-approval-controls';
import { MovieVersionPanel } from './movie-version-panel';
import type { MovieOutput } from '../../../renderer/src/movie/contracts';

export type DraftComponent = { chapterId: string; chapterTitle: string; productionId: Id<'productions'>; productionVersionId: Id<'productionVersions'>; timelineId: Id<'timelines'>; timelineVersionNumber: number; manifestId: Id<'manifests'>; episodeId?: Id<'episodes'>; episodeStoryStateId?: Id<'episodeStoryStates'>; continuityBibleId?: Id<'continuityBibles'> };
export const movieRequestKey = () => crypto.randomUUID();
export function MovieStudio({ projectId, options }: { projectId: string; options: EpisodeOption[] }) {
  const id = projectId as Id<'projects'>;
  const capabilities = useQuery(api.movies.capabilities, { projectId: id });
  const movies = usePaginatedQuery(api.movies.list, { projectId: id }, { initialNumItems: 20 });
  const create = useMutation(api.movies.create); const saveVersion = useMutation(api.movies.createVersion);
  const [title, setTitle] = useState(''); const [movieId, setMovieId] = useState<Id<'movies'>>();
  const [draft, setDraft] = useState<DraftComponent[]>([]); const [output, setOutput] = useState<MovieOutput>(); const [parent, setParent] = useState<Id<'movieVersions'>>();
  const [retained, setRetained] = useState(false); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const intent = useRef<{body:string;key:string}|undefined>(undefined);
  function requestKey(body:unknown){const value=JSON.stringify(body);if(intent.current?.body!==value)intent.current={body:value,key:movieRequestKey()};return intent.current.key;}
  const [savedVersion, setSavedVersion] = useState<Id<'movieVersions'>>();
  async function save() {
    if (!movieId || !output) return;
    setPending(true); setError('');
    try { const result = await saveVersion({ movieId, parentVersionId: parent, output, components: draft, confirmedRetainedVersions: retained, idempotencyKey: requestKey({operation:'version',movieId,parent,output,draft,retained}) }); intent.current=undefined;setSavedVersion(result.movieVersionId); setDraft([]); setParent(undefined); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The movie version could not be saved.'); } finally { setPending(false); }
  }
  function move(index: number, delta: number) { setDraft(current => { const next = [...current]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; }); }
  const enabled = capabilities?.enabled && capabilities.canEdit;
  return <div className="space-y-6">
    {!capabilities ? <p role="status">Loading movie permissions…</p> : !capabilities.enabled ? <p role="status" className="rounded-xl border border-border p-4 text-muted-foreground">Movie assembly is awaiting release verification. Saved versions remain available.</p> : null}
    <section className="ff-card space-y-4 p-5"><h2 className="text-xl font-semibold">Movies in this project</h2>
      <div className="flex flex-wrap gap-2">{movies.results.map(movie => <Button key={movie._id} variant={movieId === movie._id ? 'primary' : 'secondary'} onClick={() => { setMovieId(movie._id); setSavedVersion(undefined); setDraft([]); setParent(undefined); }}>{movie.title}</Button>)}{movies.status === 'CanLoadMore' && <Button variant="ghost" onClick={() => movies.loadMore(20)}>More movies</Button>}</div>
      {capabilities?.canEdit && <form className="flex flex-col gap-3 sm:flex-row" onSubmit={async event => { event.preventDefault(); setPending(true); setError(''); try { const result = await create({ projectId: id, title, idempotencyKey: requestKey({operation:'create',projectId,title}) });intent.current=undefined; setMovieId(result.movieId); setTitle(''); setSavedVersion(undefined); setDraft([]); setParent(undefined); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Movie unavailable.'); } finally { setPending(false); } }}><label className="flex-1 text-sm">Movie title<input className={controlInput} required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label><Button className="self-end" disabled={!enabled || pending || !title.trim()}>Create movie</Button></form>}
    </section>
    {movieId && capabilities?.canEdit && <section className="ff-card space-y-5 p-5"><div><h2 className="text-xl font-semibold">{parent ? 'New revision from a saved version' : 'Build a movie version'}</h2><p className="mt-2 text-sm text-muted-foreground">Order exact approved assemblies into chapters. Each source stays at most one minute; the movie can run up to thirty minutes. Save creates an immutable version for validation and approval.</p></div>
      <SourcePicker key={movieId} options={options} disabled={!enabled || pending || draft.length >= 128} onAdd={(component, preset) => { if (draft.length && output && (output.width !== preset.width || output.height !== preset.height || output.fps !== preset.fps)) { setError('Choose sources with the same dimensions and frame rate.'); return; } setOutput(preset); setDraft(current => [...current, component]); }} />
      {output && <p className="text-sm text-muted-foreground">Delivery: {output.width} × {output.height} · {output.fps} fps · H264 · stereo audio</p>}
      <ol className="space-y-3">{draft.map((component, index) => <li key={`${index}:${component.manifestId}`} className="rounded-xl border border-border p-4"><p className="break-all text-sm">{index + 1}. {options.find(option => option.productionId === component.productionId)?.title ?? 'Retained production'} · timeline v{component.timelineVersionNumber}</p><p className="mt-1 break-all text-xs text-muted-foreground">Exact assembly {component.manifestId}</p><label className="mt-3 block text-sm">Chapter<input className={controlInput} maxLength={80} value={component.chapterTitle} onChange={event => { const title = event.target.value; setDraft(current => current.map((row, at) => at === index ? { ...row, chapterTitle: title, chapterId: title.trim() } : row)); }} /></label><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={index === 0} onClick={() => move(index, -1)}>Move up</Button><Button size="sm" variant="secondary" disabled={index === draft.length - 1} onClick={() => move(index, 1)}>Move down</Button><Button size="sm" variant="ghost" onClick={() => setDraft(current => current.filter((_, at) => at !== index))}>Remove occurrence</Button></div></li>)}</ol>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={retained} onChange={event => setRetained(event.target.checked)} /><span>I confirm deliberate use of retained older approved production versions. Their exact media and permissions will be checked again before rendering.</span></label>
      <Button disabled={!enabled || pending || !draft.length || !output || draft.some(component => !component.chapterTitle.trim())} onClick={save}>Save new immutable version</Button>
    </section>}
    {movieId && <MovieVersions key={`${movieId}:${savedVersion ?? "saved"}`} movieId={movieId} preferred={savedVersion} options={options} onCopy={(versionId, components, preset, confirmed) => { setParent(versionId); setDraft(components); setOutput(preset); setRetained(confirmed); }} />}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
function SourcePicker({ options, disabled, onAdd }: { options: EpisodeOption[]; disabled: boolean; onAdd: (component: DraftComponent, output: MovieOutput) => void }) {
  const [production, setProduction] = useState(options[0]?.productionId ?? '');
  return <div className="space-y-3"><label className="block text-sm">Source episode or production<select className={controlInput} value={production} onChange={event => setProduction(event.target.value)}>{options.map(option => <option key={option.productionId} value={option.productionId}>{option.title}</option>)}</select></label>{production && <SourceAssemblies key={production} option={options.find(option => option.productionId === production)!} disabled={disabled} onAdd={onAdd} />}</div>;
}
function SourceAssemblies({ option, disabled, onAdd }: { option: EpisodeOption; disabled: boolean; onAdd: (component: DraftComponent, output: MovieOutput) => void }) {
  const sources = usePaginatedQuery(api.movies.sourceManifests, { productionId: option.productionId as Id<'productions'> }, { initialNumItems: 5 });
  return <div className="space-y-2">{sources.results.map(source => <div key={source.manifestId} className="flex flex-col justify-between gap-3 rounded-xl border border-border p-3 sm:flex-row"><div className="text-sm"><p>Timeline v{source.timelineVersionNumber} · {source.selection?.scope ?? 'Saved assembly'} · {source.output?.durationInFrames / source.output?.fps}s</p><p className="mt-1 break-all text-xs text-muted-foreground">Assembly {source.manifestId}</p></div><Button size="sm" variant="secondary" disabled={disabled || !source.productionVersionId || source.output?.codec !== 'h264'} onClick={() => onAdd({ chapterId: 'Chapter 1', chapterTitle: 'Chapter 1', productionId: source.productionId, productionVersionId: source.productionVersionId, timelineId: source.timelineId, timelineVersionNumber: source.timelineVersionNumber, manifestId: source.manifestId, ...(option.episodeId ? { episodeId: option.episodeId as Id<'episodes'> } : {}) }, { width: source.output.width, height: source.output.height, fps: source.output.fps, codec: 'h264', audioSampleRate: 48000, audioChannels: 2 })}>Add occurrence</Button></div>)}{sources.status === 'CanLoadMore' && <Button variant="ghost" onClick={() => sources.loadMore(5)}>Older assemblies</Button>}{sources.status === 'Exhausted' && sources.results.length === 0 && <p className="text-sm text-muted-foreground">Build a saved finishing assembly in this production’s edit workspace first.</p>}</div>;
}
function MovieVersions({ movieId, preferred, options, onCopy }: { movieId: Id<'movies'>; preferred?: Id<'movieVersions'>; options: EpisodeOption[]; onCopy: (id: Id<'movieVersions'>, components: DraftComponent[], output: MovieOutput, confirmed: boolean) => void }) {
  const versions = usePaginatedQuery(api.movies.listVersions, { movieId }, { initialNumItems: 10 }); const [chosen, setChosen] = useState<Id<'movieVersions'>>();
  const selected = chosen ?? preferred ?? versions.results[0]?._id;
  return <section className="space-y-4"><h2 className="text-xl font-semibold">Saved versions</h2><div className="flex flex-wrap gap-2">{versions.results.map(version => <Button key={version._id} variant={selected === version._id ? 'primary' : 'secondary'} onClick={() => setChosen(version._id)}>Version {version.versionNumber} · {version.state.toLowerCase()}</Button>)}{versions.status === 'CanLoadMore' && <Button variant="ghost" onClick={() => versions.loadMore(10)}>Older versions</Button>}</div>{selected && <MovieVersionPanel key={selected} id={selected} options={options} onCopy={onCopy} />}</section>;
}
