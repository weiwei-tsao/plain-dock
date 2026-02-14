'use client';

import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastProps {
  open: boolean;
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onClose: () => void;
}

const toastStyles: Record<ToastVariant, { icon: React.ReactNode; border: string }> = {
  success: {
    icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />,
    border: 'border-green-500/20',
  },
  error: {
    icon: <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />,
    border: 'border-red-500/20',
  },
  info: {
    icon: <Info className="h-4 w-4 shrink-0 text-blue-400" />,
    border: 'border-blue-500/20',
  },
};

const Toast: React.FC<ToastProps> = ({
  open,
  message,
  variant = 'success',
  duration = 2000,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [open, duration, onClose]);

  if (!open) return null;

  const style = toastStyles[variant];

  return (
    <div className="animate-in fade-in slide-in-from-top-2 fixed top-6 right-6 z-50">
      <div
        className={`flex items-center gap-3 border bg-zinc-900 px-4 py-3 ${style.border} rounded-lg shadow-2xl`}
      >
        {style.icon}
        <span className="text-sm text-zinc-200">{message}</span>
        <button
          onClick={onClose}
          className="p-0.5 text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default Toast;
