// src/migrations/schema.versions.ts

// Define the migrations type
type MigrationFunction = () => void;
type MigrationsMap = Record<number, MigrationFunction>;

export const SCHEMA_VERSIONS = {
  current: 2,
  migrations: {
    1: () => {
      console.log('Migrating storage from v1 to v2');
    },
  } as MigrationsMap, // ✅ Added type assertion
};

export const runSchemaMigrations = (): void => {
  const current = parseInt(localStorage.getItem('dmr_schema_version') || '1', 10);
  const target = SCHEMA_VERSIONS.current;
  if (current === target) return;

  for (let v = current; v < target; v++) {
    const migration = SCHEMA_VERSIONS.migrations[v];
    if (migration) {
      migration(); // ✅ Now safely called
    }
  }
  localStorage.setItem('dmr_schema_version', String(target));
};