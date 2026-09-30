import { ProtectedShell } from '@/components/Shell';
export default function Layout({ children }: { children: React.ReactNode }) { return <ProtectedShell>{children}</ProtectedShell>; }
