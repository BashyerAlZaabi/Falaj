"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

/**
 * Toast مع دعم «تراجع» — أساس الحذف القابل للتراجع (٧ ثوانٍ) في المرحلة ٥.
 * المنطقة aria-live فتُقرأ التغييرات لقارئ الشاشة.
 */
export type ToastInput = {
  message: string;
  undoLabel?: string;
  onUndo?: () => void;
  /** بالمللي ثانية — الافتراضي 7000 عند وجود تراجع، وإلا 3500 */
  duration?: number;
};

type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setItems((list) => [...list, { ...t, id }]);
      const ms = t.duration ?? (t.onUndo ? 7000 : 3500);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-3 rounded-md bg-abyss px-4 py-3 text-sm text-nacre shadow-lg"
          >
            <span>{t.message}</span>
            {t.onUndo && (
              <button
                type="button"
                onClick={() => {
                  t.onUndo?.();
                  dismiss(t.id);
                }}
                className="rounded-sm bg-white/10 px-3 py-1 font-head text-xs text-brass-l transition-colors duration-200 ease-e hover:bg-white/20"
              >
                {t.undoLabel ?? "تراجع"}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
