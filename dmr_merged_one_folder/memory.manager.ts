// src/performance/memory.manager.ts

export class MemoryManager {
  private maxMemory = 50 * 1024 * 1024; // 50 MB

  isLowMemory(): boolean {
    const perf = performance as any; // ✅ Type assertion to any
    if (perf.memory) {
      return perf.memory.usedJSHeapSize > this.maxMemory * 0.8;
    }
    return false;
  }

  clearCache(): void {
    const keys = Object.keys(localStorage);
    keys.forEach((k) => {
      if (k.startsWith('dmr_cache_') || k.startsWith('dmr_temp_')) {
        localStorage.removeItem(k);
      }
    });
  }
}

export const memory = new MemoryManager();