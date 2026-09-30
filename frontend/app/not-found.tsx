import Link from 'next/link';
export default function NotFound() { return <main className="standalone"><p className="eyebrow">404</p><h1>Esta página no existe</h1><Link className="button primary" href="/dashboard">Volver al dashboard</Link></main>; }
