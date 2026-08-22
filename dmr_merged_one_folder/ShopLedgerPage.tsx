import React, { useState, useMemo, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { Download } from "lucide-react";
import Select from "react-select";
import * as XLSX from "xlsx";
import { useShops } from "../../masters/shops/hooks/useShops";
import type { Shop } from "../../masters/shops/types/shop";
import { useSafeNotification } from "../../../hooks/useSafeNotification";
import { DatePicker } from "../../../components/common/DatePicker";
import {
  fetchShopLedger,
  type ShopLedgerRow,
} from "../services/shopLedgerService";
import { generateShopLedgerPDF } from "../components/ShopLedgerPDF";
import type { LedgerTransaction } from "../components/ShopLedgerPDF";

interface ShopLedgerProps {
  embedded?: boolean;
}

// ─── Ledger row mapping — keeps the existing LedgerTransaction shape that the
//     table + PDF/Excel exports already consume. Birds/weight/rate belong to
//     sale rows (backend trip-delivery detail); collections carry their number.
const txParticulars = (row: ShopLedgerRow): string => {
  if (row.type === "correction") return row.description || "Correction";
  if (row.type === "collection") return row.referenceNo || row.paymentMode || "Cash";
  return row.referenceNo || "Sale";
};

const mapRowToTx = (row: ShopLedgerRow): LedgerTransaction => {
  const isSale = row.type === "sale";
  return {
    date: row.date,
    particulars: txParticulars(row),
    birds: isSale ? row.birds : 0,
    weight: isSale ? row.weight : 0,
    rate: isSale ? row.rate : 0,
    debit: Number(row.debit) || 0,
    credit: Number(row.credit) || 0,
    balance: Number(row.balance) || 0,
    type: row.type,
    paymentMode: row.paymentMode ?? undefined,
    collectionNo: row.referenceNo || undefined,
  };
};

const ShopLedgerPage: React.FC<ShopLedgerProps> = ({ embedded = false }) => {
  const { showNotification } = useSafeNotification();
  const { shops } = useShops();

  const [dateFrom, setDateFrom] = useState(
    format(new Date(new Date().setDate(1)), "yyyy-MM-dd")
  );
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedShop, setSelectedShop] = useState<string>("All Shops");

  const shopOptions = useMemo(() => {
    const all = [{ value: "All Shops", label: "All Shops" }];
    const shopList = shops.map((shop: Shop) => ({
      value: shop.shopName,
      label: shop.shopName,
    }));
    return [...all, ...shopList];
  }, [shops]);

  // ── Ledger data: fetched from the backend, scoped by shop + date range ──
  const [ledgerData, setLedgerData] = useState<LedgerTransaction[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);

  const buildLedger = useCallback(
    async (from: string, to: string, shopId?: number): Promise<LedgerTransaction[]> => {
      const res = await fetchShopLedger({ fromDate: from, toDate: to, shopId });
      const openingRow: LedgerTransaction = {
        date: from,
        particulars: "Opening Balance",
        birds: 0,
        weight: 0,
        rate: 0,
        debit: 0,
        credit: 0,
        balance: Number(res.openingBalance) || 0,
        type: "sale",
      };
      return [openingRow, ...res.data.map(mapRowToTx)];
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    const shopId =
      selectedShop === "All Shops"
        ? undefined
        : shops.find((s: Shop) => s.shopName === selectedShop)?.id;
    buildLedger(dateFrom, dateTo, shopId)
      .then((tx) => {
        if (!cancelled) setLedgerData(tx);
      })
      .catch(() => {
        if (!cancelled) setLedgerData([]);
      })
      .finally(() => {
        if (!cancelled) setLedgerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, selectedShop, shops, buildLedger]);

  // ── Summary for the current view ──
  const summary = useMemo(() => {
    const tx = ledgerData.slice(1);
    const totalDebit = tx.reduce((sum, t) => sum + t.debit, 0);
    const totalCredit = tx.reduce((sum, t) => sum + t.credit, 0);
    const totalBirds = tx
      .filter((t) => t.type === "sale")
      .reduce((sum, t) => sum + t.birds, 0);
    const totalWeight = tx
      .filter((t) => t.type === "sale")
      .reduce((sum, t) => sum + t.weight, 0);
    const closingBalance = ledgerData.length > 0 ? ledgerData[ledgerData.length - 1].balance : 0;
    return { totalDebit, totalCredit, totalBirds, totalWeight, closingBalance };
  }, [ledgerData]);

  // ─── Export Functions ──────────────────────────────────────

  const handleExportPDF = useCallback(async () => {
    try {
      let shopNames: string[] = [];
      if (selectedShop === "All Shops") {
        const all = await fetchShopLedger({ fromDate: dateFrom, toDate: dateTo });
        const names = new Set<string>();
        all.data.forEach((r) => {
          if (r.shopName) names.add(r.shopName);
        });
        shopNames = Array.from(names).sort();
      } else {
        shopNames = [selectedShop];
      }

      if (shopNames.length === 0) {
        showNotification("No shops found in the selected date range.", "error");
        return;
      }

      const allLedgers: { shop: string; data: LedgerTransaction[] }[] = [];
      for (const shop of shopNames) {
        const shopId = shops.find((s: Shop) => s.shopName === shop)?.id;
        const ledger = await buildLedger(dateFrom, dateTo, shopId);
        if (ledger.length > 1) {
          allLedgers.push({ shop, data: ledger });
        }
      }

      if (allLedgers.length === 0) {
        showNotification("No transaction data to export.", "error");
        return;
      }

      generateShopLedgerPDF(allLedgers, dateFrom, dateTo, selectedShop);
      showNotification("PDF downloaded successfully.", "success");
    } catch {
      showNotification("Failed to load ledger data. Please try again.", "error");
    }
  }, [selectedShop, dateFrom, dateTo, showNotification, shops, buildLedger]);

  const handleExportExcel = useCallback(async () => {
    try {
      let shopNames: string[] = [];
      if (selectedShop === "All Shops") {
        const all = await fetchShopLedger({ fromDate: dateFrom, toDate: dateTo });
        const names = new Set<string>();
        all.data.forEach((r) => {
          if (r.shopName) names.add(r.shopName);
        });
        shopNames = Array.from(names).sort();
      } else {
        shopNames = [selectedShop];
      }

      if (shopNames.length === 0) {
        showNotification("No shops found in the selected date range.", "error");
        return;
      }

      const ledgers: { shop: string; ledger: LedgerTransaction[] }[] = [];
      for (const shop of shopNames) {
        const shopId = shops.find((s: Shop) => s.shopName === shop)?.id;
        const ledger = await buildLedger(dateFrom, dateTo, shopId);
        if (ledger.length <= 1) continue;
        ledgers.push({ shop, ledger });
      }

      const headers = ["Date", "Particulars", "Birds", "Weight (KG)", "Rate (₹)", "Debit (₹)", "Credit (₹)", "Balance (₹)", "Payment Mode"];
      const workbook = XLSX.utils.book_new();

      ledgers.forEach(({ shop, ledger }) => {
        const rows = ledger.map((t) => [
          t.date,
          t.particulars,
          t.type === "sale" ? t.birds : "-",
          t.type === "sale" ? t.weight.toFixed(2) : "-",
          t.type === "sale" ? t.rate.toFixed(2) : "-",
          t.debit.toFixed(2),
          t.credit.toFixed(2),
          t.balance.toFixed(2),
          t.paymentMode || "-",
        ]);

        const tx = ledger.slice(1);
        const totalDebit = tx.reduce((sum, t) => sum + t.debit, 0);
        const totalCredit = tx.reduce((sum, t) => sum + t.credit, 0);
        const totalBirds = tx.filter((t) => t.type === "sale").reduce((sum, t) => sum + t.birds, 0);
        const totalWeight = tx.filter((t) => t.type === "sale").reduce((sum, t) => sum + t.weight, 0);
        const closingBalance = ledger.length > 0 ? ledger[ledger.length - 1].balance : 0;
        rows.push([
          "TOTAL",
          "",
          totalBirds,
          totalWeight.toFixed(2),
          "",
          totalDebit.toFixed(2),
          totalCredit.toFixed(2),
          closingBalance.toFixed(2),
          "",
        ]);

        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(workbook, ws, shop.slice(0, 31));
      });

      const summaryRows = [
        ["Shop", "Total Debit", "Total Credit", "Closing Balance"],
      ];
      ledgers.forEach(({ shop, ledger }) => {
        const tx = ledger.slice(1);
        const totalDebit = tx.reduce((sum, t) => sum + t.debit, 0);
        const totalCredit = tx.reduce((sum, t) => sum + t.credit, 0);
        const closingBalance = ledger[ledger.length - 1].balance;
        summaryRows.push([shop, totalDebit.toFixed(2), totalCredit.toFixed(2), closingBalance.toFixed(2)]);
      });
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(workbook, summaryWs, "Summary");

      const filename = `ShopLedger_${selectedShop === "All Shops" ? "AllShops" : selectedShop.replace(/\s+/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      XLSX.writeFile(workbook, filename);
      showNotification("Excel downloaded successfully.", "success");
    } catch {
      showNotification("Failed to load ledger data. Please try again.", "error");
    }
  }, [selectedShop, dateFrom, dateTo, showNotification, shops, buildLedger]);

  // ─── React-Select styles (original) ───
  const selectStyles = {
    control: (base: any) => ({
      ...base,
      borderRadius: 8,
      borderColor: "#cbd5e1",
      boxShadow: "none",
      minHeight: 38,
      fontSize: "14px",
      "&:hover": { borderColor: "#94a3b8" },
      "&:focus-within": {
        borderColor: "#3b82f6",
        boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.15)",
      },
    }),
    option: (base: any, { isFocused, isSelected }: any) => ({
      ...base,
      backgroundColor: isSelected ? "#2563eb" : isFocused ? "#eff6ff" : "white",
      color: isSelected ? "white" : "#1e293b",
      fontSize: "13px",
      padding: "6px 12px",
    }),
    menu: (base: any) => ({
      ...base,
      zIndex: 50,
      borderRadius: 8,
      overflow: "hidden",
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
      border: "1px solid #f1f5f9",
    }),
    menuList: (base: any) => ({
      ...base,
      maxHeight: "200px",
    }),
    placeholder: (base: any) => ({
      ...base,
      color: "#94a3b8",
    }),
  };

  // ─── UI (Original Colors) ──────────────────────────────────
  return (
    <div className={`w-full space-y-4 animate-in fade-in duration-500 text-slate-800 ${
      embedded ? '' : 'px-3 md:px-6 py-4 bg-slate-50/50 min-h-screen'
    }`}>
      <div className="bg-white rounded-2xl p-4 md:p-6 border border-slate-200/85 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Shop Ledger</h2>
          <div className="flex gap-2">
            <button
              onClick={handleExportPDF}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
            >
              <Download size={16} />
              PDF
            </button>
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition"
            >
              <Download size={16} />
              Excel
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 bg-slate-50/70 rounded-xl p-3 border border-slate-200/60">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Date From</label>
            <DatePicker
              value={dateFrom}
              onChange={setDateFrom}
              placeholder="From date"
              className="w-full"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Date To</label>
            <DatePicker
              value={dateTo}
              onChange={setDateTo}
              placeholder="To date"
              className="w-full"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Shop</label>
            <Select
              options={shopOptions}
              value={shopOptions.find((opt) => opt.value === selectedShop)}
              onChange={(selected) => setSelectedShop(selected?.value || "All Shops")}
              isSearchable
              placeholder="Search or select shop..."
              styles={selectStyles}
              maxMenuHeight={200}
            />
          </div>
          <button
            onClick={() => {
              setDateFrom(format(new Date(new Date().setDate(1)), "yyyy-MM-dd"));
              setDateTo(format(new Date(), "yyyy-MM-dd"));
              setSelectedShop("All Shops");
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 transition"
          >
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500">Total Debit (Sales)</p>
            <p className="text-xl font-bold text-emerald-600">₹ {summary.totalDebit.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500">Total Credit (Collections)</p>
            <p className="text-xl font-bold text-blue-600">₹ {summary.totalCredit.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500">Total Birds</p>
            <p className="text-xl font-bold text-slate-800">{summary.totalBirds}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500">Total Weight (KG)</p>
            <p className="text-xl font-bold text-slate-800">{summary.totalWeight.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500">Closing Balance</p>
            <p className={`text-xl font-bold ${summary.closingBalance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              ₹ {summary.closingBalance.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/70 overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-sm border-b border-slate-200 text-slate-700 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Particulars</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Birds</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Weight (KG)</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Rate</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Debit</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Credit</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Balance</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Payment Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      {ledgerLoading
                        ? "Loading ledger..."
                        : "No transactions found for the selected filters."}
                    </td>
                  </tr>
                ) : (
                  <>
                    {ledgerData.map((tx, idx) => {
                      const isOpening = idx === 0;
                      const isSale = tx.type === "sale";
                      const typeLabel =
                        tx.type === "sale"
                          ? { text: "(Sale)", color: "text-emerald-600" }
                          : tx.type === "collection"
                            ? { text: "(Collection)", color: "text-blue-600" }
                            : { text: "(Correction)", color: "text-rose-600" };
                      return (
                        <tr
                          key={idx}
                          className={`transition-colors ${isOpening ? "bg-amber-50/50 font-semibold" : "hover:bg-slate-50/80"}`}
                        >
                          <td className="px-4 py-3 text-xs font-medium text-slate-600">{tx.date}</td>
                          <td className="px-4 py-3 text-xs font-medium text-slate-700">
                            {tx.particulars}
                            {!isOpening && (
                              <span className={`ml-2 text-[10px] font-semibold ${typeLabel.color}`}>
                                {typeLabel.text}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-xs">{isSale ? tx.birds : "-"}</td>
                          <td className="px-4 py-3 text-center text-xs">{isSale ? tx.weight.toFixed(2) : "-"}</td>
                          <td className="px-4 py-3 text-center text-xs">{isSale ? tx.rate.toFixed(2) : "-"}</td>
                          <td className="px-4 py-3 text-center text-xs font-bold text-emerald-600">
                            {tx.debit > 0 ? `₹ ${tx.debit.toFixed(2)}` : "-"}
                          </td>
                          <td className="px-4 py-3 text-center text-xs font-bold text-blue-600">
                            {tx.credit > 0 ? `₹ ${tx.credit.toFixed(2)}` : "-"}
                          </td>
                          <td className={`px-4 py-3 text-center text-xs font-bold ${tx.balance >= 0 ? "text-slate-800" : "text-rose-600"}`}>
                            ₹ {tx.balance.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center text-xs">{tx.paymentMode || "-"}</td>
                        </tr>
                      );
                    })}
                    {ledgerData.length > 1 && (
                      <tr className="bg-slate-100/80 font-bold border-t-2 border-slate-300">
                        <td className="px-4 py-3 text-xs text-slate-700" colSpan={2}>
                          TOTAL
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-slate-800">{summary.totalBirds}</td>
                        <td className="px-4 py-3 text-center text-xs text-slate-800">{summary.totalWeight.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center text-xs text-slate-800">-</td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-emerald-700">
                          ₹ {summary.totalDebit.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-blue-700">
                          ₹ {summary.totalCredit.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-slate-800">
                          ₹ {summary.closingBalance.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-slate-800">-</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopLedgerPage;