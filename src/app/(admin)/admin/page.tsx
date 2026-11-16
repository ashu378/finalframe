import Link from 'next/link';
import { requirePlatformRole } from '@/lib/guards/platform';
import { PLATFORM_READ_ROLES, type PlatformInventoryKind } from '@/lib/platform-admin/contracts';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { api } from '../../../../convex/_generated/api';

export const metadata = { title: 'Platform admin | FinalFrame' };
const sections: Array<{ href: string; kind: PlatformInventoryKind; label: string; description: string }> = [
  { href: '/admin/users', kind: 'users', label: 'Accounts', description: 'Find accounts and review changes to their access.' },
  { href: '/admin/account-requests', kind: 'roles', label: 'Account requests', description: 'Review requests to close an account or restore access. Saved work is kept.' },
  { href: '/admin/roles', kind: 'roles', label: 'Platform access', description: 'Choose who can manage FinalFrame. The last administrator cannot be removed.' },
  { href: '/admin/jobs', kind: 'jobs', label: 'Video jobs', description: 'See work in progress, failed jobs and reported AI costs across studios.' },
  { href: '/admin/moderation', kind: 'reports', label: 'Content reports', description: 'Review reported content and record your decision.' },
  { href: '/admin/credits', kind: 'credits', label: 'Credit history', description: 'Check credits added, held, used or returned. Payments stay off.' },
  { href: '/admin/audit', kind: 'audit', label: 'Activity log', description: 'See who changed account access, reviewed content or changed AI settings.' },
  { href: '/admin/video-routing', kind: 'routing', label: 'AI model settings', description: 'Check available AI models and restrict one when needed.' },
];
export default async function AdminDashboardPage() {
  const access = await requirePlatformRole();
  const current = await (await getAuthenticatedConvexClient()).query(api.account.current, {});
  const canManageStudio = !!current.studio && (current.role === 'owner' || current.role === 'admin');
  return <div className="space-y-8"><header><h1 className="ff-display mt-4 text-4xl font-semibold">Manage FinalFrame.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">Your platform role is {access.role.toLowerCase()}. Changes are recorded. Your studio team has separate settings.</p></header><div className="divide-y divide-border border-y border-border">{sections.filter((section) => PLATFORM_READ_ROLES[section.kind].includes(access.role)).map((section) => <Link key={section.href} href={section.href} className="group grid gap-2 py-6 transition-colors hover:text-primary sm:grid-cols-[.45fr_1fr] sm:gap-8"><h2 className="text-xl font-semibold">{section.label}</h2><p className="text-sm leading-7 text-muted-foreground">{section.description}</p></Link>)}</div>{canManageStudio ? <Link href="/dashboard/settings/operations" className="ff-link inline-flex min-h-11 items-center text-sm">Open your studio settings</Link> : null}</div>;
}
