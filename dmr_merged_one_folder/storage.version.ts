export const STORAGE_VERSION = 2;

export const getStorageVersion = (): number => {
  const raw = localStorage.getItem('dmr_storage_version');
  return raw ? parseInt(raw, 10) : 1;
};

export const setStorageVersion = (version: number): void => {
  localStorage.setItem('dmr_storage_version', String(version));
};