import { useMemo } from "react";
import { Scale, AlertTriangle, AlertCircle, Box, FileText } from "lucide-react";
import type { ShopDelivery, BoxDetail } from "../../types/trip";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Props {
  boxDetails?: BoxDetail[];
  deliveries: ShopDelivery[];
  dcWeight: number;
  totalFarmBirds: number;
  tripNo?: string;
  vehicleNo?: string;
  supervisorName?: string;
  tripDate?: string;
}

export default function BoxWeightAnalysis({
  boxDetails = [],
  deliveries,
  dcWeight,
  totalFarmBirds: _totalFarmBirds,
  tripNo = "N/A",
  vehicleNo = "N/A",
  supervisorName = "N/A",
  tripDate = new Date().toLocaleDateString(),
}: Props) {
  // Aggregate unloaded details per box across all shop deliveries
  const analysisData = useMemo(() => {
    return boxDetails.map((box, index) => {
      const rawBox = box as BoxDetail & { id?: string | number; birdCount?: number; birds?: number };
      const boxIdentifier = String(rawBox.boxNo ?? index + 1);

      const boxUnloads = deliveries.filter((d) => {
        const rawDelivery = d as ShopDelivery & { boxId?: string | number };
        return (
          String(d.boxNo) === boxIdentifier ||
          (rawDelivery.boxId !== undefined && String(rawDelivery.boxId) === String(rawBox.id))
        );
      });

      const farmBirds = rawBox.birdCount ?? rawBox.birds ?? 0;
      const farmWeight = rawBox.weight ?? 0;

      const unloadedBirds = boxUnloads.reduce((sum, u) => sum + (u.birds || 0), 0);
      const unloadedWeight = boxUnloads.reduce((sum, u) => sum + (u.weight || 0), 0);
      const mortality = boxUnloads.reduce((sum, u) => sum + (u.mortality || 0), 0);

      const weightLoss = farmWeight > 0 ? farmWeight - unloadedWeight : 0;
      const lossPercentage = farmWeight > 0 ? (weightLoss / farmWeight) * 100 : 0;

      const deliveredShops = Array.from(
        new Set(boxUnloads.map((u) => u.shopName).filter(Boolean))
      ).join(", ");

      return {
        boxNo: rawBox.boxNo ? `Box ${rawBox.boxNo}` : `Box ${index + 1}`,
        farmBirds,
        farmWeight,
        unloadedBirds,
        unloadedWeight,
        mortality,
        weightLoss,
        lossPercentage,
        deliveredShops: deliveredShops || "Not Unloaded",
      };
    });
  }, [boxDetails, deliveries]);

  // Overall Totals
  const totalFarmWeight =
    boxDetails.reduce((sum, b) => sum + (b.weight || 0), 0) || dcWeight;
  const totalUnloadedWeight = deliveries.reduce((sum, d) => sum + (d.weight || 0), 0);
  const totalMortality = deliveries.reduce((sum, d) => sum + (d.mortality || 0), 0);
  const totalWeightLoss = totalFarmWeight - totalUnloadedWeight;
  const totalLossPercentage =
    totalFarmWeight > 0 ? (totalWeightLoss / totalFarmWeight) * 100 : 0;

  // ─── PDF GENERATION HANDLER ──────────────────────────────────────
  const handleDownloadPDF = () => {
    const doc = new jsPDF();

    // 1. Title Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text("Box-Wise Weight Loss & Mortality Analysis", 14, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 24);

    // 2. Trip Details Bar
    doc.setFillColor(241, 245, 249);
    doc.rect(14, 28, 182, 14, "F");

    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "bold");
    doc.text(`Trip No: ${tripNo}`, 18, 37);
    doc.text(`Vehicle: ${vehicleNo}`, 65, 37);
    doc.text(`Supervisor: ${supervisorName}`, 115, 37);
    doc.text(`Date: ${tripDate}`, 165, 37);

    // 3. KPI Summary Table
    autoTable(doc, {
      startY: 46,
      head: [["Loaded Farm Wt", "Unloaded Wt", "Transit Wt Loss", "Total Mortality"]],
      body: [
        [
          `${totalFarmWeight.toFixed(2)} Kg`,
          `${totalUnloadedWeight.toFixed(2)} Kg`,
          `${totalWeightLoss.toFixed(2)} Kg (${totalLossPercentage.toFixed(1)}%)`,
          `${totalMortality} Birds`,
        ],
      ],
      theme: "grid",
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
        halign: "center",
      },
      bodyStyles: {
        fontSize: 10,
        fontStyle: "bold",
        halign: "center",
        textColor: [15, 23, 42],
      },
    });

    // 4. Detailed Box Breakdown Table
    const tableRows = analysisData.map((row) => [
      row.boxNo,
      row.deliveredShops,
      `${row.farmBirds} bds / ${row.farmWeight.toFixed(2)} kg`,
      `${row.unloadedBirds} bds / ${row.unloadedWeight.toFixed(2)} kg`,
      row.mortality > 0 ? `${row.mortality}` : "0",
      row.weightLoss > 0 ? `-${row.weightLoss.toFixed(2)} kg` : `${Math.abs(row.weightLoss).toFixed(2)} kg`,
      `${row.lossPercentage.toFixed(2)}%`,
    ]);

    const lastTableY = (doc as any).lastAutoTable?.finalY || 65;

    autoTable(doc, {
      startY: lastTableY + 8,
      head: [
        [
          "Box #",
          "Delivered Shop",
          "Farm Loaded",
          "Unloaded",
          "Mortality",
          "Weight Loss",
          "Shrinkage %",
        ],
      ],
      body: tableRows,
      theme: "striped",
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 20 },
        1: { cellWidth: 40 },
        2: { halign: "right", cellWidth: 35 },
        3: { halign: "right", cellWidth: 35 },
        4: { halign: "center", cellWidth: 18 },
        5: { halign: "right", cellWidth: 22 },
        6: { halign: "right", cellWidth: 20 },
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
    });

    doc.save(`Box_Analysis_Trip_${tripNo}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* Top Header Bar with PDF Icon Button */}
      <div className="flex items-center justify-between pb-1">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Box Weight Variance Summary
        </h3>
        <button
          type="button"
          onClick={handleDownloadPDF}
          className="p-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200/60 transition-colors flex items-center justify-center shrink-0"
          title="Download PDF Report"
        >
          <FileText size={16} className="stroke-[2]" />
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
            <Scale size={13} className="text-blue-600" /> Loaded Farm Wt
          </span>
          <p className="text-base font-bold text-slate-800 mt-1">
            {totalFarmWeight.toFixed(2)} Kg
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
            <Scale size={13} className="text-emerald-600" /> Unloaded Wt
          </span>
          <p className="text-base font-bold text-slate-800 mt-1">
            {totalUnloadedWeight.toFixed(2)} Kg
          </p>
        </div>

        <div
          className={`p-3 rounded-xl border ${
            totalWeightLoss > 0
              ? "bg-amber-50/50 border-amber-200"
              : "bg-slate-50 border-slate-200"
          }`}
        >
          <span className="text-[11px] font-semibold text-amber-700 uppercase flex items-center gap-1">
            <AlertCircle size={13} className="text-amber-600" /> Transit Wt Loss
          </span>
          <p className="text-base font-bold text-amber-900 mt-1">
            {totalWeightLoss.toFixed(2)} Kg{" "}
            <span className="text-xs font-medium text-amber-700">
              ({totalLossPercentage.toFixed(1)}%)
            </span>
          </p>
        </div>

        <div
          className={`p-3 rounded-xl border ${
            totalMortality > 0
              ? "bg-rose-50/50 border-rose-200"
              : "bg-slate-50 border-slate-200"
          }`}
        >
          <span className="text-[11px] font-semibold text-rose-700 uppercase flex items-center gap-1">
            <AlertTriangle size={13} className="text-rose-600" /> Total Mortality
          </span>
          <p className="text-base font-bold text-rose-900 mt-1">
            {totalMortality} Birds
          </p>
        </div>
      </div>

      {/* Detailed Box Comparison Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
              <th className="p-3">Box #</th>
              <th className="p-3">Delivered Shop</th>
              <th className="p-3 text-right">Farm Loaded (Birds / Kg)</th>
              <th className="p-3 text-right">Unloaded (Birds / Kg)</th>
              <th className="p-3 text-center">Mortality</th>
              <th className="p-3 text-right">Weight Loss (Kg)</th>
              <th className="p-3 text-right">Shrinkage %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {analysisData.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-400">
                  No box data available to analyze.
                </td>
              </tr>
            ) : (
              analysisData.map((row, idx) => {
                const isHighLoss = row.lossPercentage > 3;

                return (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isHighLoss ? "bg-amber-50/30" : ""
                    }`}
                  >
                    <td className="p-3 font-bold text-slate-800 flex items-center gap-1.5">
                      <Box size={14} className="text-slate-400" /> {row.boxNo}
                    </td>
                    <td
                      className="p-3 text-slate-600 font-medium max-w-[150px] truncate"
                      title={row.deliveredShops}
                    >
                      {row.deliveredShops}
                    </td>
                    <td className="p-3 text-right font-medium text-slate-700">
                      {row.farmBirds} bds /{" "}
                      <span className="font-semibold">
                        {row.farmWeight.toFixed(2)} kg
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium text-slate-700">
                      {row.unloadedBirds} bds /{" "}
                      <span className="font-semibold text-emerald-700">
                        {row.unloadedWeight.toFixed(2)} kg
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {row.mortality > 0 ? (
                        <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold text-[11px]">
                          {row.mortality}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td
                      className={`p-3 text-right font-bold ${
                        row.weightLoss > 0
                          ? "text-amber-700"
                          : "text-emerald-600"
                      }`}
                    >
                      {row.weightLoss > 0
                        ? `-${row.weightLoss.toFixed(2)} kg`
                        : `${Math.abs(row.weightLoss).toFixed(2)} kg`}
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                          isHighLoss
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.lossPercentage.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}