// src/offline/offline.manager.ts

import { storage } from '../storage/storage.manager';

export class OfflineManager {
  private onlineStatus: boolean = navigator.onLine;

  constructor() {
    window.addEventListener('online', () => this.updateStatus(true));
    window.addEventListener('offline', () => this.updateStatus(false));
  }

  private updateStatus(status: boolean): void {
    this.onlineStatus = status;
    storage.set('system_online_status', status);
  }

  isOnline(): boolean {
    return this.onlineStatus;
  }

  private actionQueue: { action: () => void }[] = [];

  queueAction(action: () => void): void {
    if (!this.isOnline()) {
      this.actionQueue.push({ action });
    } else {
      action();
    }
  }

  syncPendingActions(): void {
    if (this.isOnline() && this.actionQueue.length > 0) {
      const queue = [...this.actionQueue];
      this.actionQueue = [];
      queue.forEach((item) => item.action());
    }
  }
}

export const offlineManager = new OfflineManager();