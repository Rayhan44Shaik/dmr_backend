// src/hooks/useSafeNotification.ts

import { useNotification } from "../providers/NotificationProvider";

export function useSafeNotification() {
  try {
    return useNotification();
  } catch {
    return {
      showNotification: (msg: string, type?: "success" | "error" | "info") => {
        console.log(`[${type?.toUpperCase() || 'INFO'}] ${msg}`);
        alert(msg);
      },
      hideNotification: () => {},
    };
  }
}