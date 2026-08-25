export default function WorkspaceLoading() {
  return <div className="space-y-6" aria-busy="true" aria-label="Loading video project workspace"><div className="h-8 w-64 animate-pulse rounded-full bg-secondary" /><div className="h-48 animate-pulse rounded-[1.25rem] bg-secondary" /><div className="grid gap-4 sm:grid-cols-3"><div className="h-32 animate-pulse rounded-[1.25rem] bg-secondary" /><div className="h-32 animate-pulse rounded-[1.25rem] bg-secondary" /><div className="h-32 animate-pulse rounded-[1.25rem] bg-secondary" /></div></div>;
}
