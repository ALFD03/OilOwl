/**
 * Modales de la aplicación.
 *
 * Se renderizan en <body> mediante un portal: si quedaran dentro de la página, cualquier
 * ancestro con `transform` (animaciones de entrada, tarjetas con hover) se volvería su
 * contenedor y el modal quedaría encerrado a la altura de la tabla que lo abrió.
 */
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '../../lib/cn'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

// El alto se ajusta al contenido (hasta el 92 % de la pantalla, luego desplaza por dentro)
// y el ancho depende del tipo de contenido. En pantallas pequeñas todos ocupan el ancho útil.
const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-lg', // confirmaciones
  md: 'max-w-2xl', // formularios cortos
  lg: 'max-w-4xl', // formularios medianos
  xl: 'max-w-6xl', // formularios extensos, permisos, detalle de auditoría
}

export function Modal({
  open, title, onClose, children, size = 'lg', description,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  size?: ModalSize
  description?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-[#050a14]/75 p-3 backdrop-blur-md sm:p-6"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('card animate-scale-in flex max-h-[92vh] w-full flex-col overflow-hidden shadow-[var(--shadow-lg)]', SIZES[size])}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="border-base flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4 sm:px-8">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            {description && <p className="text-muted mt-1 text-sm">{description}</p>}
          </div>
          <button className="btn-ghost -mr-2 p-2" onClick={onClose} aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** Barra de acciones del modal: queda fija al pie aunque el contenido se desplace. */
export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="modal-actions">{children}</div>
}

export function ConfirmModal({
  open, title, message, confirmLabel = 'Confirmar', danger = false, busy = false, onConfirm, onClose, children,
}: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean
  onConfirm: () => void; onClose: () => void; children?: ReactNode
}) {
  return (
    <Modal open={open} title={title} onClose={onClose} size="sm">
      <div className="space-y-5 text-sm">
        <div className="text-soft leading-relaxed">{message}</div>
        {children}
        <ModalActions>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
        </ModalActions>
      </div>
    </Modal>
  )
}
