'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = ref.current; return () => node?.close(); }, []);
  // El diálogo debe seguir abierto mientras el padre lo mantenga montado (p. ej. si rechazó cerrarlo por estar ocupado).
  useEffect(() => { const node = ref.current; if (node && !node.open) node.showModal(); });
  // Escape no debe cerrar el diálogo nativo por su cuenta: el padre decide (puede negarse mientras guarda).
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); onClose(); }} onClose={onClose}><div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20}/></button></div>{children}</dialog>;
}
