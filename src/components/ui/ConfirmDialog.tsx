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

const variantStyles: Record<DialogVariant, { icon: React.ReactNode; iconBg: string; confirmBg: string; confirmHover: string }> = {
  danger: {
    icon: <AlertTriangle className="w-5 h-5 text-red-400" />,
    iconBg: 'bg-red-500/10',
    confirmBg: 'bg-red-600',
    confirmHover: 'hover:bg-red-500',
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    iconBg: 'bg-amber-500/10',
    confirmBg: 'bg-amber-600',
    confirmHover: 'hover:bg-amber-500',
  },
  info: {
    icon: <Info className="w-5 h-5 text-blue-400" />,
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
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in-95">
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 p-1 text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className={`shrink-0 w-10 h-10 rounded-full ${style.iconBg} flex items-center justify-center`}>
            {style.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
            <p className="mt-1 text-sm text-zinc-400 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${style.confirmBg} ${style.confirmHover}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
