/**
 * Shared bulk-import utilities:
 *  - template generation (.xlsx)
 *  - file parsing + column/header normalization
 *  - sequential per-row create helper for masters without a bulk endpoint
 */

import * as XLSX from "xlsx";
import type {
  BulkImportColumn,
  BulkImportConfig,
  CreateManyResult,
  ParsedImportRow,
} from "./bulkImportTypes";

/** Download an .xlsx template containing headers + one sample row. */
export function downloadImportTemplate<T, E = T>(
  config: BulkImportConfig<T, E>
): void {
  const headers = config.columns.map((c) =>
    c.required ? `${c.key} *` : c.key
  );
  const sampleRow = config.columns.map((c) => c.sample);

  const worksheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  worksheet["!cols"] = config.columns.map(() => ({ wch: 22 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template");

  const filename = `${config.filenamePrefix}_Template.xlsx`;
  XLSX.writeFile(workbook, filename);
}

function acceptedLabels(column: BulkImportColumn): string[] {
  return [column.key, ...(column.aliases ?? [])];
}

/** Normalize case, surrounding whitespace, and a trailing template-required marker. */
function normalizeHeaderLabel(label: string): string {
  return label.trim().replace(/\s*\*\s*$/, "").trim().toLowerCase();
}

/**
 * Map uploaded header labels to canonical keys. A header like "Mobile Number *"
 * or "Phone *" is matched against each column's accepted labels.
 */
function normalizeHeaders(
  rawHeaders: string[],
  columns: BulkImportColumn[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalized = new Map(
    rawHeaders.map((header) => [normalizeHeaderLabel(header), header])
  );

  for (const column of columns) {
    const match = acceptedLabels(column).find((label) =>
      normalized.has(normalizeHeaderLabel(label))
    );
    if (match) {
      mapping[column.key] = normalized.get(normalizeHeaderLabel(match))!;
    }
  }
  return mapping;
}

/** Check required columns are present in the uploaded file. */
export function findMissingColumns(
  rawHeaders: string[],
  columns: BulkImportColumn[]
): string[] {
  const headers = new Set(rawHeaders.map(normalizeHeaderLabel));
  return columns
    .filter(
      (column) =>
        column.required &&
        !acceptedLabels(column).some((label) =>
          headers.has(normalizeHeaderLabel(label))
        )
    )
    .map((column) => column.key);
}

export type ParsedFile<T> = {
  rows: ParsedImportRow<T>[];
  missingColumns: string[];
  parseError: string | null;
};

/**
 * Read an .xlsx/.xls/.csv file, normalize every row to canonical keys,
 * then run the config's parseRow + validateRow.
 */
export async function parseImportFile<T, E = T>(
  file: File,
  config: BulkImportConfig<T, E>,
  existing: E[]
): Promise<ParsedFile<T>> {
  const parsed: ParsedFile<T> = {
    rows: [],
    missingColumns: [],
    parseError: null,
  };

  let workbook: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array" });
  } catch {
    parsed.parseError = "Could not read this file. Please upload a valid .xlsx, .xls or .csv file.";
    return parsed;
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    parsed.parseError = "The file does not contain any sheets.";
    return parsed;
  }
  const worksheet = workbook.Sheets[sheetName];
  const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet);

  if (json.length === 0) {
    parsed.parseError = "The file does not contain any data rows.";
    return parsed;
  }

  const rawHeaders = Object.keys(json[0]);
  parsed.missingColumns = findMissingColumns(rawHeaders, config.columns);
  if (parsed.missingColumns.length > 0) {
    parsed.parseError =
      "The file is missing required columns: " + parsed.missingColumns.join(", ");
    return parsed;
  }

  const mapping = normalizeHeaders(rawHeaders, config.columns);
  const seen = new Set<string>();

  parsed.rows = json
    .filter((row) => Object.values(row).some((v) => v !== "" && v != null))
    .map((rawRow, index): ParsedImportRow<T> => {
      const record: Record<string, unknown> = {};
      for (const column of config.columns) {
        const sourceHeader = mapping[column.key];
        record[column.key] = sourceHeader ? rawRow[sourceHeader] : "";
      }

      const data = config.parseRow(record);
      const errors = [...config.validateRow(data, existing)];

      const dupKey = config.duplicateKey?.(data);
      if (dupKey !== undefined) {
        const normalizedKey = String(dupKey).trim().toLowerCase();
        if (seen.has(normalizedKey)) {
          errors.push(`Duplicate ${config.noun.toLowerCase()} within the uploaded file.`);
        }
        seen.add(normalizedKey);
      }

      return {
        rowNumber: index + 2, // +1 data offset from header row, +1 from 0-index
        values: record,
        data,
        errors,
      };
    });

  return parsed;
}

/**
 * Helper for masters that only have a single-create API: runs every valid row
 * through createOne, collecting per-row failures, and reports progress.
 */
export async function executeSequentialImport<T>(
  rows: ParsedImportRow<T>[],
  createOne: (data: T) => Promise<void>,
  errorToString: (err: unknown) => string,
  onProgress: (done: number, total: number) => void
): Promise<CreateManyResult> {
  const total = rows.length;
  const errors: CreateManyResult["errors"] = [];
  let imported = 0;

  onProgress(0, total);
  for (let i = 0; i < rows.length; i += 1) {
    try {
      await createOne(rows[i].data);
      imported += 1;
    } catch (err) {
      errors.push({ row: rows[i].rowNumber, message: errorToString(err) });
    }
    onProgress(i + 1, total);
  }

  return {
    total,
    attempted: total,
    imported,
    failed: errors.length,
    errors,
  };
}