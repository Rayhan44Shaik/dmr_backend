// src/storage/config/storage.config.ts

export const STORAGE_CONFIG = {
  version: 2,
  prefix: 'dmr_',
  masterKeys: ['dmr-shops', 'dmr-vehicles', 'dmr-employees', 'dmr-farms', 'dmr-banks', 'dmr-birdTypes'],
  transactionKeys: ['vehicleTrips', 'shopSales', 'dmr-collections', 'dmr-fuel-expenses', 'dmr-attendance', 'dmr-salary', 'dmr-leave'],
  systemKeys: ['dmr-session', 'dmr-cache', 'dmr-preferences'],
  backupKey: 'dmr-backup',
};