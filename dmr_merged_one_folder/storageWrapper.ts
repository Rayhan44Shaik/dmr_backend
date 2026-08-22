// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\storage\storageWrapper.ts

export class StorageWrapper {
  private static PREFIX = "dmr_erp_";

  /**
   * Save data directly to LocalStorage without automatic deletion
   */
  static set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(this.PREFIX + key, JSON.stringify(value));
    } catch (error) {
      console.error(`StorageWrapper: Quota exceeded or save error on key "${key}"`, error);
    }
  }

  /**
   * Retrieve data safely
   */
  static get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(this.PREFIX + key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      console.error(`StorageWrapper: Error parsing key "${key}"`, error);
      return null;
    }
  }

  static remove(key: string): void {
    localStorage.removeItem(this.PREFIX + key);
  }
}