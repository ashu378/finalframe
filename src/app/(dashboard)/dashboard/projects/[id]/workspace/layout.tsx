import { WorkspaceNav } from '@/components/production-workspace/workspace-nav';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <div className="space-y-8"><WorkspaceNav />{children}</div>;
}
