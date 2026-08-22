// src/migrations/migration.manager.ts

import { runSchemaMigrations } from './schema.versions';

export class MigrationManager {
  runMigrations(): void {
    try {
      runSchemaMigrations();
      console.log('✅ Migrations completed successfully');
    } catch (error) {
      console.error('❌ Migration failed:', error);
    }
  }

  getCurrentVersion(): number {
    return parseInt(localStorage.getItem('dmr_schema_version') || '1', 10);
  }

  getLatestVersion(): number {
    return 2; // Update this when schema version changes
  }
}

export const migrationManager = new MigrationManager();