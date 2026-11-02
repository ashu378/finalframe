import Link from 'next/link';
import { requirePlatformRole } from '@/lib/guards/platform';
import { PLATFORM_READ_ROLES, type PlatformInventoryKind } from '@/lib/platform-admin/contracts';

export const metadata = { title: 'Platform administration | FinalFrame' };
const sections: Array<{ href: string; kind: PlatformInventoryKind; label: string; description: string }> = [
  { href: '/admin/users', kind: 'users', label: 'Accounts', description: 'Review accounts and audited account access changes.' },
  { href: '/admin/roles', kind: 'roles', label: 'Platform access', description: 'Manage explicit platform roles with last-administrator protection.' },
  { href: '/admin/jobs', kind: 'jobs', label: 'Generation jobs', description: 'Inspect projected job status and reported provider costs across studios.' },
  { href: '/admin/moderation', kind: 'reports', label: 'Content reports', description: 'Review submitted concerns and record a moderation decision.' },
  { href: '/admin/credits', kind: 'credits', label: 'Credit ledger', description: 'Read canonical accounting entries without creating a payment.' },
  { href: '/admin/audit', kind: 'audit', label: 'Platform audit', description: 'Follow recorded platform access, moderation, and routing decisions.' },
  { href: '/admin/video-routing', kind: 'routing', label: 'Routing records', description: 'Inspect catalog records and disable a reviewed route when needed.' },
];
export default async function AdminDashboardPage() {
  const access = await requirePlatformRole();
  return <div className="space-y-8"><header><p className="ff-eyebrow">Platform administration</p><h1 className="ff-display mt-4 text-4xl font-semibold">Review the service with clear authority.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">Your explicit platform role is {access.role.toLowerCase()}. Lists are paginated and actions are audited. Studio ownership and team administration remain separate.</p></header><div className="grid gap-5 md:grid-cols-2">{sections.filter((section) => PLATFORM_READ_ROLES[section.kind].includes(access.role)).map((section) => <Link key={section.href} href={section.href} className="ff-card p-6 transition hover:border-primary"><h2 className="text-xl font-semibold">{section.label}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{section.description}</p></Link>)}</div><Link href="/dashboard/settings/operations" className="ff-link inline-flex min-h-11 items-center text-sm">Open your studio operations</Link></div>;
}
