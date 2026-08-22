import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

interface RefreshToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
  isError?: boolean;
}

const RefreshToast: React.FC<RefreshToastProps> = ({
  message,
  isVisible,
  onClose,
  duration = 5000,
  isError = false,
}) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [isVisible, duration, onClose]);

  if (!show) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 animate-slide-in"
      role="alert"
      aria-live="polite"
      style={{ animation: 'slide-in 0.3s ease-out' }}
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl shadow-lg min-w-[280px] max-w-sm">
        <div className={`p-2 rounded-lg flex-shrink-0 ${isError ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
          {isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
        </div>
        <span className={`text-sm font-medium flex-1 ${isError ? 'text-rose-800' : 'text-slate-800'}`}>{message}</span>
        <button
          onClick={() => {
            setShow(false);
            onClose();
          }}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition flex-shrink-0"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}} />
    </div>
  );
};

export default React.memo(RefreshToast);