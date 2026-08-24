export default function DashboardLoading() {
    return <div className="space-y-8" aria-busy="true" aria-label="Loading your studio"><div className="h-36 animate-pulse rounded-[1.5rem] bg-secondary" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-40 animate-pulse rounded-[1.25rem] bg-secondary" />)}</div><div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]"><div className="h-96 animate-pulse rounded-[1.25rem] bg-secondary" /><div className="h-96 animate-pulse rounded-[1.25rem] bg-secondary" /></div></div>;
}
