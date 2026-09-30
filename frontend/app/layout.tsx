import type { Metadata } from 'next';
import { AuthProvider } from '@/hooks/use-auth';
import './globals.css';
export const metadata: Metadata = { title: { default: 'MAGLEV · Smart Monitor', template: '%s · MAGLEV' }, description: 'Monitoreo del tren Maglev y su estación solar con datos reales.', icons: { icon: '/favicon.svg' }, robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="es"><body><AuthProvider>{children}</AuthProvider></body></html>; }
