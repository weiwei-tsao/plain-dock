'use client';

import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

type DialogVariant = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  variant?: DialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const variantStyles: Record<
  DialogVariant,
  { icon: React.ReactNode; iconBg: string; confirmBg: string; confirmHover: string }
> = {
  danger: {
    icon: <AlertTriangle className="h-5 w-5 text-red-400" />,
    iconBg: 'bg-red-500/10',
    confirmBg: 'bg-red-600',
    confirmHover: 'hover:bg-red-500',
  },
  warning: {
    icon: <AlertTriangle className="h-5 w-5 text-amber-400" />,
    iconBg: 'bg-amber-500/10',
    confirmBg: 'bg-amber-600',
    confirmHover: 'hover:bg-amber-500',
  },
  info: {
    icon: <Info className="h-5 w-5 text-blue-400" />,
    iconBg: 'bg-blue-500/10',
    confirmBg: 'bg-blue-600',
    confirmHover: 'hover:bg-blue-500',
  },
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title = 'Confirm',
  message,
  variant = 'danger',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const style = variantStyles[variant];

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      {/* Dialog */}
      <div className="animate-in fade-in zoom-in-95 relative mx-4 w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 rounded-lg p-1 text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-4">
          <div
            className={`h-10 w-10 shrink-0 rounded-full ${style.iconBg} flex items-center justify-center`}
          >
            {style.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{message}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${style.confirmBg} ${style.confirmHover}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
