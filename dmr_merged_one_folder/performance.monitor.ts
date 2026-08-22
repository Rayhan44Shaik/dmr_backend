// src/performance/performance.monitor.ts

export class PerformanceMonitor {
  private startTime: number = 0;

  start(): void {
    this.startTime = performance.now();
  }

  stop(): number {
    return performance.now() - this.startTime;
  }

  measure(operation: string): void {
    const duration = this.stop();
    if (duration > 200) {
      console.warn(`⚠️ Slow operation: ${operation} took ${duration.toFixed(2)}ms`);
    } else {
      console.log(`✅ ${operation} completed in ${duration.toFixed(2)}ms`);
    }
  }

  static memory(): string {
    const perf = performance as any; // ✅ Type assertion to any
    if (perf.memory) {
      return `${(perf.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`;
    }
    return 'N/A';
  }
}

export const monitor = new PerformanceMonitor();