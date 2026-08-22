/**
 * Shared bulk-import types used across all master modules.
 * Each master supplies a BulkImportConfig<T> describing its own
 * columns/template, row parsing, validation, and import behaviour.
 */

export type BulkImportColumn = {
  /** Canonical header label written into the downloadable template. */
  key: string;
  /** Other acceptable headers found in a user-uploaded file. */
  aliases?: string[];
  /** Marked as required in the template header (shown with *). */
  required?: boolean;
  /** Sample value placed in the template's example row. */
  sample: string | number;
};

export type ParsedImportRow<T> = {
  /** 1-based row number from the source sheet (for error reporting). */
  rowNumber: number;
  /** Canonical column values retained for the generic preview table. */
  values: Record<string, unknown>;
  /** Row data parsed by the master config. */
  data: T;
  /** Human-readable validation errors. Empty array = valid row. */
  errors: string[];
};

export type ImportFailure = {
  row: number;
  message: string;
};

export type CreateManyResult = {
  total: number;
  attempted: number;
  imported: number;
  failed: number;
  errors: ImportFailure[];
};

export type BulkImportConfig<T, E = T> = {
  /** Modal title, e.g. "Bulk Import Shops". */
  title: string;
  /** Modal subtitle / helper text. */
  subtitle: string;
  /** Singular noun, e.g. "Shop". */
  noun: string;
  /** Plural noun, e.g. "Shops". */
  nounPlural: string;
  /** Prefix used for the downloaded template filename. */
  filenamePrefix: string;
  /** Optional icon rendered in the dialog header. */
  icon?: React.ReactNode;
  /** Column definitions (template + accepted headers). */
  columns: BulkImportColumn[];
  /** Convert a normalized record (keyed by canonical column.key) to row data. */
  parseRow: (record: Record<string, unknown>) => T;
  /** Return a list of error strings for a row (empty = valid). */
  validateRow: (row: T, existing: E[]) => string[];
  /** Return a key identifying logical duplicates within one file. */
  duplicateKey?: (row: T) => string;
  /** Build the API input payload from parsed row data. */
  toPayload: (row: T) => unknown;
  /**
   * Persist the valid rows. Must call onProgress(done, total) as work advances
   * and return a CreateManyResult summary.
   */
  createMany: (
    rows: ParsedImportRow<T>[],
    onProgress: (done: number, total: number) => void
  ) => Promise<CreateManyResult>;
  /** Refresh the parent page list after a successful import. */
  refresh: () => Promise<unknown>;
  /** Convert an unknown error to a readable message. */
  errorToString: (err: unknown) => string;
};