type RefreshCallback = () => void;

export class AutoRefreshManager {
  private interval: number | null = null;
  private callbacks: RefreshCallback[] = [];
  private intervalTime: number = 5 * 60 * 1000; // 5 minutes

  start(intervalTime?: number) {
    if (intervalTime) this.intervalTime = intervalTime;
    if (this.interval) return;
    this.interval = window.setInterval(() => {
      this.callbacks.forEach((cb) => cb());
    }, this.intervalTime);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  register(callback: RefreshCallback) {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }
}

export const autoRefresh = new AutoRefreshManager();