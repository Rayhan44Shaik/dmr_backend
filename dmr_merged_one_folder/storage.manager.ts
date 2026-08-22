import { STORAGE_CONFIG } from './storage.config';

// src/storage/managers/storage.manager.ts

export class StorageManager {
  private prefix = STORAGE_CONFIG.prefix;

  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Failed to set storage key "${key}":`, error);
    }
  }

  remove(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }

  clear(): void {
    const keys = Object.keys(localStorage);
    keys.forEach((k) => {
      if (k.startsWith(this.prefix)) {
        localStorage.removeItem(k);
      }
    });
  }

  clearTransactions(): void {
    STORAGE_CONFIG.transactionKeys.forEach((key) => {
      localStorage.removeItem(this.prefix + key);
    });
  }

  getKeys(): string[] {
    return Object.keys(localStorage).filter((k) => k.startsWith(this.prefix));
  }

  size(): number {
    let total = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length;
      }
    }
    return total;
  }
}

export const storage = new StorageManager();