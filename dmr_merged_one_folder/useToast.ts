// Using a simple toast implementation without external dependency
type ToastType = 'success' | 'error' | 'info';

export function useToast() {
  const showToast = (msg: string, type: ToastType = 'info') => {
    // Simple console fallback
    const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    console.log(`${prefix} ${msg}`);
    
    // If you want to use a toast library, uncomment and install:
    // import { toast } from 'react-hot-toast';
    // return toast[type](msg);
  };

  return {
    success: (msg: string) => showToast(msg, 'success'),
    error: (msg: string) => showToast(msg, 'error'),
    info: (msg: string) => showToast(msg, 'info'),
  };
}