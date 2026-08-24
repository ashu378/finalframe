export default function AdminLoading() {
  return <div className="space-y-8" aria-busy="true" aria-label="Loading operations"><div className="h-5 w-28 animate-pulse rounded-full bg-[#342b25]" /><div className="h-14 w-2/3 animate-pulse rounded-2xl bg-[#342b25]" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-[#2a231f]" />)}</div></div>;
}
