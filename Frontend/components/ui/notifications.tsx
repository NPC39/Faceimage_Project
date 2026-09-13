'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NotificationVariant = 'success' | 'info' | 'warning' | 'error';

export interface NotificationItem {
  id: string;
  title: string;
  description?: string;
  variant?: NotificationVariant;
  duration?: number;
}

interface NotificationBannerProps {
  title: string;
  description?: string;
  variant?: NotificationVariant;
  onClose?: () => void;
  className?: string;
}

const variantStyles: Record<NotificationVariant, { border: string; icon: React.ReactNode; bg: string }> = {
  success: {
    border: 'border-zinc-700/60',
    bg: 'bg-zinc-900/90',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />,
  },
  info: {
    border: 'border-zinc-800',
    bg: 'bg-zinc-900/90',
    icon: <Info className="h-4 w-4 text-zinc-300 shrink-0" />,
  },
  warning: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-950/20',
    icon: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />,
  },
  error: {
    border: 'border-red-500/30',
    bg: 'bg-red-950/20',
    icon: <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />,
  },
};

export function NotificationBanner({
  title,
  description,
  variant = 'info',
  onClose,
  className,
}: NotificationBannerProps) {
  const style = variantStyles[variant];

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-4 shadow-xl backdrop-blur-md transition-all text-sm',
        style.bg,
        style.border,
        className
      )}
    >
      {style.icon}
      <div className="flex-1 space-y-0.5">
        <p className="font-medium text-zinc-100">{title}</p>
        {description && <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-md"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Global Toast Container Context & Hook
interface ToastContextType {
  toast: (item: Omit<NotificationItem, 'id'>) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<NotificationItem[]>([]);

  const toast = React.useCallback((item: Omit<NotificationItem, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: NotificationItem = { id, duration: 4000, ...item };

    setToasts((prev) => [...prev, newToast]);

    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, newToast.duration);
    }
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="pointer-events-auto"
            >
              <NotificationBanner
                title={t.title}
                description={t.description}
                variant={t.variant}
                onClose={() => removeToast(t.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    // Fallback simple alert if outside provider
    return {
      toast: (item: Omit<NotificationItem, 'id'>) => {
        console.log(`[Notification] ${item.variant || 'info'}: ${item.title} - ${item.description || ''}`);
      },
    };
  }
  return context;
}
