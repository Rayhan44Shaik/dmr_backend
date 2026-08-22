import type { ReactNode } from "react";
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = "info", duration: number = 4000) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto animate-in slide-in-from-right duration-300 max-w-xs ${
              toast.type === "success"
                ? "bg-green-600 text-white"
                : toast.type === "error"
                ? "bg-red-600 text-white"
                : "bg-blue-600 text-white"
            } rounded-xl shadow-2xl border border-white/20 overflow-hidden`}
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-start gap-3 p-4">
              <div
                className={`flex-shrink-0 rounded-full p-1.5 ${
                  toast.type === "success"
                    ? "bg-green-200 text-green-700"
                    : toast.type === "error"
                    ? "bg-red-200 text-red-700"
                    : "bg-blue-200 text-blue-700"
                }`}
              >
                {toast.type === "success" && <CheckCircle size={18} />}
                {toast.type === "error" && <XCircle size={18} />}
                {toast.type === "info" && <Info size={18} />}
              </div>
              <p className="flex-1 text-sm font-medium leading-relaxed pt-0.5">
                {toast.message}
              </p>
              <button
                onClick={() => {}}
                className="flex-shrink-0 -mr-1 p-1 text-white/70 hover:text-white rounded-full hover:bg-white/20 transition-colors"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return {
    success: (msg: string, duration?: number) => context.showToast(msg, "success", duration),
    error: (msg: string, duration?: number) => context.showToast(msg, "error", duration),
    info: (msg: string, duration?: number) => context.showToast(msg, "info", duration),
  };
}