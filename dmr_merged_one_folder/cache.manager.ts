interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // in milliseconds
}

export class CacheManager {
  private prefix = 'dmr_cache_';

  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl };
    localStorage.setItem(this.prefix + key, JSON.stringify(entry));
  }

  get<T>(key: string): T | null {
    const raw = localStorage.getItem(this.prefix + key);
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (Date.now() - entry.timestamp > entry.ttl) {
        localStorage.removeItem(this.prefix + key);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  invalidate(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }

  clear(): void {
    const keys = Object.keys(localStorage);
    keys.forEach((k) => {
      if (k.startsWith(this.prefix)) localStorage.removeItem(k);
    });
  }
}

export const cache = new CacheManager();