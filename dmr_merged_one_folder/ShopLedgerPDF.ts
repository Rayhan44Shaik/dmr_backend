import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface LedgerTransaction {
  date: string;
  particulars: string;
  birds: number;
  weight: number;
  rate: number;
  debit: number;
  credit: number;
  balance: number;
  type: "sale" | "collection" | "correction";
  paymentMode?: string;
  collectionNo?: string;
}

export const generateShopLedgerPDF = (
  allLedgers: { shop: string; data: LedgerTransaction[] }[],
  dateFrom: string,
  dateTo: string,
  selectedShop: string
) => {
  // Setup A4 Portrait
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  
  const headers = ["Date", "Particulars", "Birds", "Weight", "Rate", "Debit", "Credit", "Balance"];

  allLedgers.forEach(({ shop, data }, index) => {
    if (index > 0) doc.addPage();

    const pageWidth = doc.internal.pageSize.getWidth();

    // ─── Header ───
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text("DMR POULTRIES - SHOP LEDGER STATEMENT", 14, 15);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(14, 18, pageWidth - 14, 18);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Shop: ${shop}`, 14, 25);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text(`Period: ${dateFrom} to ${dateTo}`, 14, 30);

    // ─── Build Rows ───
    const rows = data.map((t) => {
      let label = t.particulars;
      if (t.particulars !== "Opening Balance") {
        if (t.type === "sale") {
          label = `${t.particulars} : Sale`;
        } else {
          label = `${t.particulars}`;
        }
      }

      return [
        t.date,
        label,
        t.type === "sale" && t.birds > 0 ? String(t.birds) : "-",
        t.type === "sale" && t.weight > 0 ? t.weight.toFixed(2) : "-",
        t.type === "sale" && t.rate > 0 ? t.rate.toFixed(2) : "-",
        t.debit > 0 ? t.debit.toFixed(2) : "-",
        t.credit > 0 ? t.credit.toFixed(2) : "-",
        t.balance.toFixed(2),
      ];
    });

    // Calculate Totals
    const tx = data.slice(1);
    const totalDebit = tx.reduce((sum, t) => sum + t.debit, 0);
    const totalCredit = tx.reduce((sum, t) => sum + t.credit, 0);
    const totalBirds = tx.filter((t) => t.type === "sale").reduce((sum, t) => sum + t.birds, 0);
    const totalWeight = tx.filter((t) => t.type === "sale").reduce((sum, t) => sum + t.weight, 0);
    const closingBalance = data.length > 0 ? data[data.length - 1].balance : 0;

    rows.push([
      "TOTAL",
      "",
      String(totalBirds),
      totalWeight.toFixed(2),
      "",
      totalDebit.toFixed(2),
      totalCredit.toFixed(2),
      closingBalance.toFixed(2),
    ]);

    // ─── AutoTable Styling (Strictly fitted within A4 printable bounds) ───
    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 34,
      margin: { top: 34, bottom: 15, left: 14, right: 14 },
      theme: "grid",
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: "bold",
        halign: "center",
        fontSize: 8,
        lineWidth: 0.3,
        lineColor: [0, 0, 0],
        cellPadding: 2,
      },
      bodyStyles: {
        valign: "middle",
        fontSize: 7.5,
        textColor: [0, 0, 0],
        cellPadding: 2,
        lineWidth: 0.2,
        lineColor: [100, 100, 100],
      },
      didParseCell: (hookData) => {
        hookData.cell.styles.fontStyle = "normal";
        if (hookData.row.index === rows.length - 1) {
          hookData.cell.styles.fillColor = [240, 240, 240];
          hookData.cell.styles.fontStyle = "bold";
        }
      },
      // Total column widths equal exactly 182mm (the exact printable width of A4 portrait with 14mm margins)
      columnStyles: {
        0: { cellWidth: 20, halign: "center" }, // Date
        1: { cellWidth: 52, halign: "left" },   // Particulars
        2: { cellWidth: 14, halign: "center" }, // Birds
        3: { cellWidth: 18, halign: "right" },  // Weight
        4: { cellWidth: 14, halign: "right" },  // Rate
        5: { cellWidth: 21, halign: "right" },  // Debit
        6: { cellWidth: 21, halign: "right" },  // Credit
        7: { cellWidth: 22, halign: "right" },  // Balance
      },
      didDrawPage: (data) => {
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(50, 50, 50);
        doc.text(`Page ${data.pageNumber}`, pageWidth - 14, pageHeight - 8, { align: "right" });
        doc.text("DMR Poultries ERP - Shop Ledger Statement", 14, pageHeight - 8);
      },
    });
  });

  const filename = `ShopLedger_${selectedShop === "All Shops" ? "AllShops" : selectedShop.replace(/\s+/g, "_")}_${dateFrom}_to_${dateTo}.pdf`;
  doc.save(filename);
};