/**
 * BulkImportDialog — shared multi-step modal used by every master module.
 *
 * Flow: Template → Upload → Parse/Validate → Preview → Confirm → Progress → Result
 *
 * Driven entirely by a master-specific BulkImportConfig<T> so the visual
 * structure and interaction flow stay identical across Shops/Farms/Vehicles/BirdTypes.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  X,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Download,
  Loader2,
} from "lucide-react";
import type {
  BulkImportConfig,
  CreateManyResult,
  ParsedImportRow,
} from "./bulkImportTypes";
import { downloadImportTemplate, parseImportFile } from "./bulkImportUtils";

type Step = "upload" | "preview" | "progress" | "result";

type BulkImportDialogProps<T, E> = {
  open: boolean;
  onClose: () => void;
  config: BulkImportConfig<T, E>;
  existing: E[];
  onImported?: (result: CreateManyResult) => void;
};

export default function BulkImportDialog<T, E>({
  open,
  onClose,
  config,
  existing,
  onImported,
}: BulkImportDialogProps<T, E>) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedImportRow<T>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<CreateManyResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validCount = useMemo(
    () => rows.filter((r) => r.errors.length === 0).length,
    [rows]
  );

  const reset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setRows([]);
    setParseError(null);
    setMissing([]);
    setProgress({ done: 0, total: 0 });
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = () => {
    if (step === "progress") return;
    reset();
    onClose();
  };

  const handleSelectFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    setStep("upload");

    const parsed = await parseImportFile(file, config, existing);
    if (parsed.parseError) {
      setParseError(parsed.parseError);
      setMissing(parsed.missingColumns);
      setRows([]);
      return;
    }
    setMissing(parsed.missingColumns);
    setRows(parsed.rows);
    setStep("preview");
  };

  const handleConfirmImport = async () => {
    const validRows = rows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) return;

    setStep("progress");
    setProgress({ done: 0, total: validRows.length });

    let res: CreateManyResult;
    try {
      res = await config.createMany(validRows, (done, total) =>
        setProgress({ done, total })
      );
    } catch (err) {
      res = {
        total: validRows.length,
        attempted: validRows.length,
        imported: 0,
        failed: validRows.length,
        errors: [
          {
            row: 0,
            message: config.errorToString(err),
          },
        ],
      };
    }

    setResult(res);
    setStep("result");
    await config.refresh().catch(() => undefined);
    onImported?.(res);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-blue-100 text-blue-600 rounded-xl">
              {config.icon ?? <Upload size={20} />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{config.title}</h2>
              <p className="text-xs text-slate-500">{config.subtitle}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={step === "progress"}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 pt-4 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 shrink-0">
          {(["upload", "preview", "progress", "result"] as Step[]).map((s, i) => {
            const labels: Record<Step, string> = {
              upload: "Upload",
              preview: "Preview",
              progress: "Import",
              result: "Result",
            };
            const active =
              (step === "result" && s === "result") ||
              step === s ||
              (s === "result" && step === "progress");
            const doneOrder =
              (step === "preview" && i < 1) ||
              (step === "progress" && i <= 2) ||
              step === "result";
            return (
              <div key={s} className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 transition-colors ${
                    active ? "text-blue-700" : doneOrder ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold border ${
                      active
                        ? "bg-blue-600 text-white border-blue-600"
                        : doneOrder
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}
                  >
                    {doneOrder && !active ? <CheckCircle2 size={12} /> : i + 1}
                  </span>
                  {labels[s]}
                </span>
                {s !== "result" && <span className="w-5 h-px bg-slate-300" />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {step === "upload" && (
            <div className="space-y-5">
              {/* Download template */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-9 h-9 bg-emerald-100 text-emerald-600 rounded-lg shrink-0">
                    <Download size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      Step 1: Download the template
                    </p>
                    <p className="text-xs text-slate-500">
                      Use the template to format your data. Required columns are marked with *.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => downloadImportTemplate(config)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  <FileSpreadsheet size={16} />
                  Download Template
                </button>
              </div>

              {/* Upload area */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  void handleSelectFile(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-12 cursor-pointer transition-colors ${
                  isDragging
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-center w-12 h-12 bg-blue-100 text-blue-600 rounded-full">
                  <Upload size={22} />
                </div>
                <p className="text-sm font-semibold text-slate-700">
                  Step 2: Upload your Excel / CSV file
                </p>
                <p className="text-xs text-slate-500">
                  Click to browse or drag & drop · .xlsx, .xls or .csv
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => void handleSelectFile(e.target.files)}
                />
              </div>

              {fileName && !parseError && (
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <Loader2 size={14} className="text-blue-500 animate-spin" />
                  Parsing <span className="font-medium text-blue-700">{fileName}</span>...
                </div>
              )}

              {parseError && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                  <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700">{parseError}</p>
                    {missing.length > 0 && (
                      <p className="text-xs text-red-600 mt-1">
                        Missing: {missing.join(", ")}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      Download the template to see the exact column names, then try again.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              {/* Summary chips */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-full text-xs font-medium text-slate-600">
                  Total rows <span className="font-bold">{rows.length}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-medium text-emerald-700">
                  <CheckCircle2 size={14} /> Valid <span className="font-bold">{validCount}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full text-xs font-medium text-red-700">
                  <XCircle size={14} /> Invalid <span className="font-bold">{rows.length - validCount}</span>
                </span>
              </div>

              {/* Preview table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[46vh] overflow-y-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-14">
                          Row
                        </th>
                        {config.columns.map((col) => (
                          <th
                            key={col.key}
                            className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
                          >
                            {col.key}
                          </th>
                        ))}
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-52">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {rows.map((row) => {
                        const invalid = row.errors.length > 0;
                        return (
                          <tr
                            key={row.rowNumber}
                            className={invalid ? "bg-red-50/40" : "bg-white"}
                          >
                            <td className="px-4 py-2.5 text-xs text-slate-400 font-medium">
                              {row.rowNumber}
                            </td>
                            {config.columns.map((col) => {
                              const value = row.values[col.key];
                              return (
                                <td
                                  key={col.key}
                                  className="px-4 py-2.5 text-slate-700 whitespace-nowrap max-w-[220px] truncate"
                                  title={String(value ?? "")}
                                >
                                  {String(value ?? "") || <span className="text-slate-300">—</span>}
                                </td>
                              );
                            })}
                            <td className="px-4 py-2.5">
                              {invalid ? (
                                <div className="space-y-0.5">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                                        <XCircle size={12} /> Invalid
                                      </span>
                                  {row.errors.map((e) => (
                                    <p key={e} className="text-[11px] text-red-600 leading-tight">
                                      {e}
                                    </p>
                                  ))}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                                  <CheckCircle2 size={12} /> Valid
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === "progress" && (
            <div className="flex flex-col items-center justify-center gap-5 py-12">
              <div className="flex items-center justify-center w-14 h-14 bg-blue-100 text-blue-600 rounded-full">
                <Loader2 size={26} className="animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">
                  Importing {config.nounPlural}...
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {progress.done} of {progress.total} processed
                </p>
              </div>
              <div className="w-full max-w-md">
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{
                      width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {step === "result" && result && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center gap-3 py-6">
                {result.failed === 0 ? (
                  <div className="flex items-center justify-center w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full">
                    <CheckCircle2 size={32} />
                  </div>
                ) : result.imported === 0 ? (
                  <div className="flex items-center justify-center w-16 h-16 bg-red-100 text-red-600 rounded-full">
                    <XCircle size={32} />
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-16 h-16 bg-amber-100 text-amber-600 rounded-full">
                    <AlertTriangle size={32} />
                  </div>
                )}
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-800">
                    {result.failed === 0
                      ? `${result.imported} ${config.nounPlural} imported successfully`
                      : result.imported === 0
                        ? "Import failed"
                        : `Imported ${result.imported} of ${result.attempted} ${config.nounPlural}`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {result.failed} row{result.failed === 1 ? "" : "s"} failed · {result.total} row
                    {result.total === 1 ? "" : "s"} imported
                  </p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="border border-red-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-red-50 border-b border-red-200">
                    <p className="text-sm font-semibold text-red-700">Failed rows</p>
                  </div>
                  <div className="max-h-[30vh] overflow-y-auto divide-y divide-slate-100">
                    {result.errors.map((err, i) => (
                      <div key={i} className="px-4 py-2 flex gap-3 text-sm">
                        <span className="text-xs font-semibold text-red-600 px-1.5 py-0.5 bg-red-50 rounded shrink-0 self-start">
                          Row {err.row}
                        </span>
                        <p className="text-slate-600">{err.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          {step === "upload" ? (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          ) : step === "preview" ? (
            <button
              onClick={() => {
                setStep("upload");
                setRows([]);
                setParseError(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft size={16} /> Choose another file
            </button>
          ) : step === "result" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={reset}
                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Import another file
              </button>
              <button
                onClick={handleClose}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <span />
          )}

          {step === "preview" && (
            <button
              onClick={() => void handleConfirmImport()}
              disabled={validCount === 0}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={16} />
              Import {validCount} valid {config.nounPlural}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}