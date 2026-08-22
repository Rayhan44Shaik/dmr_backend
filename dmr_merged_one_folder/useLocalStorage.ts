import { useState, useCallback } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    // 1. SSR Check: Ensure window exists before accessing localStorage
    if (typeof window === 'undefined') {
      return initialValue;
    }
    
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key “${key}”:`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      // 2. Use React's built-in previous state to prevent stale closures
      setStoredValue((prev) => {
        // Evaluate the new value using the absolute latest state (prev)
        const valueToStore = value instanceof Function ? value(prev) : value;
        
        // 3. Save to local storage safely
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
        
        return valueToStore;
      });
    } catch (error) {
      console.warn(`Error setting localStorage key “${key}”:`, error);
    }
  }, [key]); // Only re-create if the key changes

  return [storedValue, setValue] as const;
}