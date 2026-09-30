'use client';
import { Notice } from '@/components/ui';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="standalone"><h1>No fue posible mostrar esta vista</h1><Notice tone="error">Ocurrió un error inesperado. Puedes volver a intentarlo.</Notice><button className="button" onClick={reset}>Reintentar</button></main>; }
