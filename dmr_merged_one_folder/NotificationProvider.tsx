import type { ReactNode } from "react";
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

type NotificationType = "success" | "error" | "info";

interface NotificationContextType {
  showNotification: (message: string, type?: NotificationType, duration?: number) => void;
  hideNotification: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<NotificationType>("info");
  const timeoutRef = useRef<number | undefined>(undefined);

  const hideNotification = useCallback(() => {
    setVisible(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const showNotification = useCallback(
    (msg: string, t: NotificationType = "info", dur: number = 5000) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
      setMessage(msg);
      setType(t);
      setVisible(true);

      timeoutRef.current = window.setTimeout(() => {
        hideNotification();
      }, dur);
    },
    [hideNotification]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && visible) {
        hideNotification();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, hideNotification]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      hideNotification();
    }
  };

  return (
    <NotificationContext.Provider value={{ showNotification, hideNotification }}>
      {children}
      {visible && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 pointer-events-none transition-opacity duration-200"
          onClick={handleBackdropClick}
          role="presentation"
        >
          <div
            className="pointer-events-auto max-w-md w-full mx-4 rounded-2xl bg-white shadow-2xl border border-slate-200/50 animate-in fade-in zoom-in duration-200"
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-start gap-3 p-5 pb-2">
              <div
                className={`flex-shrink-0 rounded-full p-1.5 ${
                  type === "success"
                    ? "bg-green-100 text-green-600"
                    : type === "error"
                    ? "bg-red-100 text-red-600"
                    : "bg-blue-100 text-blue-600"
                }`}
              >
                {type === "success" && <CheckCircle size={20} />}
                {type === "error" && <XCircle size={20} />}
                {type === "info" && <Info size={20} />}
              </div>
              <p className="flex-1 text-sm text-slate-700 leading-relaxed pt-0.5">
                {message}
              </p>
              <button
                onClick={hideNotification}
                className="flex-shrink-0 -mr-1 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                aria-label="Close notification"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pb-5 pt-2">
              <button
                onClick={hideNotification}
                className={`w-full rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors ${
                  type === "success"
                    ? "bg-green-600 hover:bg-green-700"
                    : type === "error"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {type === "error" ? "OK" : "Got it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
}