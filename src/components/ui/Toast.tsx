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
    icon: <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />,
    border: 'border-green-500/20',
  },
  error: {
    icon: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
    border: 'border-red-500/20',
  },
  info: {
    icon: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
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
    <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-top-2">
      <div className={`flex items-center gap-3 px-4 py-3 bg-zinc-900 border ${style.border} rounded-lg shadow-2xl`}>
        {style.icon}
        <span className="text-sm text-zinc-200">{message}</span>
        <button
          onClick={onClose}
          className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default Toast;
