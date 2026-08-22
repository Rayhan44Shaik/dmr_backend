import { STORAGE_VERSION, getStorageVersion, setStorageVersion } from './storage.version';
import { storage } from './storage.manager';

const migrations: Record<number, () => void> = {
  1: () => {
    // Migration from v1 to v2: rename keys or transform data
    // Example: rename old key to new key
    const oldData = storage.get('old_key');
    if (oldData) {
      storage.set('new_key', oldData);
      storage.remove('old_key');
    }
  },
  // Add more migrations for future versions
};

export function runMigrations(): void {
  const currentVersion = getStorageVersion();
  if (currentVersion === STORAGE_VERSION) return;

  for (let v = currentVersion; v < STORAGE_VERSION; v++) {
    if (migrations[v]) {
      migrations[v]();
    }
  }
  setStorageVersion(STORAGE_VERSION);
}