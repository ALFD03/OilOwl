import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

export function Modal({ open, title, onClose, children, wide = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
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
  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#050a14]/70 p-4 pt-[8vh] backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card animate-scale-in w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-6 shadow-[var(--shadow-lg)]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button className="btn-ghost -mr-2 p-2" onClick={onClose} aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmModal({
  open, title, message, confirmLabel = 'Confirmar', danger = false, busy = false, onConfirm, onClose, children,
}: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean
  onConfirm: () => void; onClose: () => void; children?: ReactNode
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-5 text-sm">
        <div className="text-soft leading-relaxed">{message}</div>
        {children}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  )
}
