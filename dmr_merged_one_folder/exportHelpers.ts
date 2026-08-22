// src/modules/accounts/components/Summary/exportHelpers.ts

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import type { WeeklyMetrics, ExpenseBreakdown } from '../../types/summary.types';

// ---- Helpers ----
const formatCurrencyPlain = (amount: number): string => {
  return `Rs. ${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
};

const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-IN').format(num);
};

/**
 * Get the width of a text string in mm for a given font size.
 */
const getTextWidth = (doc: jsPDF, text: string, fontSize: number): number => {
  doc.setFontSize(fontSize);
  const unitWidth = doc.getStringUnitWidth(text);
  return unitWidth * fontSize / 1.5; // approximate conversion to mm
};

// ---- PDF Export – Clean, Professional, No Logo ----
export const exportPDF = async (
  title: string,
  dateRange: string,
  weeklyGroups: { label: string }[],
  weeklyMetrics: WeeklyMetrics[],
  weeklyExpenses: ExpenseBreakdown[],
  totalMetrics: WeeklyMetrics,
  totalExpenses: ExpenseBreakdown
): Promise<void> => {
  const doc = new jsPDF('l', 'mm', 'a4');
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const fy = `Financial Year: ${new Date().getFullYear()}-${new Date().getFullYear()+1}`;

  // ─── Header ────────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(title, margin, 20);

  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${dateRange}  |  ${fy}`, margin, 28);

  // Separator line
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, 32, pageWidth - margin, 32);

  // ─── Determine column widths ────────────────────────────────────
  const numDataCols = weeklyGroups.length;
  const headerFontSize = 8;
  const bodyFontSize = 7.5;

  // Measure the widest week label
  let maxLabelWidth = 0;
  weeklyGroups.forEach(g => {
    const w = getTextWidth(doc, g.label, headerFontSize);
    if (w > maxLabelWidth) maxLabelWidth = w;
  });
  // Add padding for cell padding and safety margin
  const dataColWidth = Math.min(Math.max(maxLabelWidth + 4, 28), 50);
  
  // Fixed widths for first and total columns
  const firstColWidth = 35;
  const totalColWidth = 20;
  
  // Check if total width exceeds page width; if so, reduce data column width proportionally
  const totalNeeded = firstColWidth + numDataCols * dataColWidth + totalColWidth + margin * 2;
  let finalDataColWidth = dataColWidth;
  if (totalNeeded > pageWidth) {
    // Reduce data column width to fit
    const available = pageWidth - margin * 2 - firstColWidth - totalColWidth;
    finalDataColWidth = Math.max(18, available / numDataCols);
  }

  const colWidths = [firstColWidth];
  for (let i = 0; i < numDataCols; i++) {
    colWidths.push(finalDataColWidth);
  }
  colWidths.push(totalColWidth);

  const columnStyles = colWidths.reduce((acc, w, idx) => {
    acc[idx] = { cellWidth: w };
    return acc;
  }, {} as any);

  // ─── Summary Table ──────────────────────────────────────────────
  const summaryHeaders = ['Particulars', ...weeklyGroups.map(g => g.label), 'Total'];

  const summaryRows: any[][] = [
    { key: 'trips', label: 'No. of Trips' },
    { key: 'birds', label: 'No. of Birds' },
    { key: 'weight', label: 'Birds in KG' },
    { key: 'mortality', label: 'Mortality (Birds)' },
    { key: 'sales', label: 'Sales Amount (Rs.)' },
    { key: 'collection', label: 'Collection Amount (Rs.)' },
    { key: 'pending', label: 'Pending Collection (Rs.)' },
  ].map(item => {
    const row: any[] = [item.label];
    weeklyMetrics.forEach(m => {
      const val = (m[item.key as keyof WeeklyMetrics] as number) || 0;
      if (item.key === 'sales' || item.key === 'collection' || item.key === 'pending') {
        row.push(formatCurrencyPlain(val));
      } else if (item.key === 'weight') {
        row.push(val.toFixed(2));
      } else {
        row.push(formatNumber(val));
      }
    });
    const totalVal = (totalMetrics[item.key as keyof WeeklyMetrics] as number) || 0;
    if (item.key === 'sales' || item.key === 'collection' || item.key === 'pending') {
      row.push(formatCurrencyPlain(totalVal));
    } else if (item.key === 'weight') {
      row.push(totalVal.toFixed(2));
    } else {
      row.push(formatNumber(totalVal));
    }
    return row;
  });

  autoTable(doc, {
    head: [summaryHeaders],
    body: summaryRows,
    startY: 38,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: {
      fontSize: bodyFontSize,
      cellPadding: 1.8,
      textColor: 0,
      lineColor: [180, 180, 180],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: 0,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: headerFontSize,
    },
    columnStyles: columnStyles,
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index > 0) {
        data.cell.styles.halign = 'right';
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // ─── Expenses Table ─────────────────────────────────────────────
  const expenseHeaders = ['Expense', ...weeklyGroups.map(g => g.label), 'Total'];

  const expenseRows: any[][] = [
    { key: 'farm', label: 'Farm Payment (Rs.)' },
    { key: 'fuel', label: 'Fuel Payment (Rs.)' },
    { key: 'trip', label: 'Trip Expenses (Rs.)' },
    { key: 'salary', label: 'Salaries (Rs.)' },
    { key: 'maintenance', label: 'Vehicle Maintenance (Rs.)' },
    { key: 'office', label: 'Office & Other Expenses (Rs.)' },
  ].map(item => {
    const row: any[] = [item.label];
    weeklyExpenses.forEach(w => {
      const val = (w[item.key as keyof ExpenseBreakdown] as number) || 0;
      row.push(formatCurrencyPlain(val));
    });
    const totalVal = (totalExpenses[item.key as keyof ExpenseBreakdown] as number) || 0;
    row.push(formatCurrencyPlain(totalVal));
    return row;
  });

  // Total Expenses row
  const totalExpRow: any[] = ['Total Expenses (Rs.)'];
  weeklyExpenses.forEach(w => {
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    totalExpRow.push(formatCurrencyPlain(sum));
  });
  totalExpRow.push(formatCurrencyPlain(Object.values(totalExpenses).reduce((a, b) => a + b, 0)));

  // Net Profit row
  const netProfitRow: any[] = ['Net Profit (Rs.)'];
  weeklyMetrics.forEach((m, idx) => {
    const totalExp = Object.values(weeklyExpenses[idx] || {}).reduce((a, b) => a + b, 0);
    const profit = m.sales - totalExp;
    netProfitRow.push(formatCurrencyPlain(profit));
  });
  netProfitRow.push(formatCurrencyPlain(totalMetrics.sales - Object.values(totalExpenses).reduce((a, b) => a + b, 0)));

  expenseRows.push(totalExpRow);
  expenseRows.push(netProfitRow);

  autoTable(doc, {
    head: [expenseHeaders],
    body: expenseRows,
    startY: finalY,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: {
      fontSize: bodyFontSize,
      cellPadding: 1.8,
      textColor: 0,
      lineColor: [180, 180, 180],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: 0,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: headerFontSize,
    },
    columnStyles: columnStyles,
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index > 0) {
        data.cell.styles.halign = 'right';
      }
      if (data.section === 'body') {
        const rowIndex = data.row.index;
        if (rowIndex === expenseRows.length - 1 || rowIndex === expenseRows.length - 2) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [250, 250, 250];
        }
      }
    },
  });

  // Footer
  const finalY2 = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `Generated on: ${new Date().toLocaleString()}  |  All amounts are calculated based on the selected date range.`,
    margin,
    finalY2
  );

  doc.save(`${title.replace(/\s/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

// ---- Excel Export – Unchanged ----
export const exportExcel = (
  title: string,
  dateRange: string,
  weeklyGroups: { label: string }[],
  weeklyMetrics: WeeklyMetrics[],
  weeklyExpenses: ExpenseBreakdown[],
  totalMetrics: WeeklyMetrics,
  totalExpenses: ExpenseBreakdown
): void => {
  const wb = XLSX.utils.book_new();
  const wsData: any[][] = [];

  // Header
  wsData.push([title]);
  wsData.push([`Period: ${dateRange}  |  Financial Year: ${new Date().getFullYear()}-${new Date().getFullYear()+1}`]);
  wsData.push([]);

  // Summary Table
  wsData.push(['BUSINESS SUMMARY']);
  const summaryHeaders = ['Particulars', ...weeklyGroups.map(g => g.label), 'Total'];
  wsData.push(summaryHeaders);

  const summaryRows = [
    { key: 'trips', label: 'No. of Trips' },
    { key: 'birds', label: 'No. of Birds' },
    { key: 'weight', label: 'Birds in KG' },
    { key: 'mortality', label: 'Mortality (Birds)' },
    { key: 'sales', label: 'Sales Amount (₹)' },
    { key: 'collection', label: 'Collection Amount (₹)' },
    { key: 'pending', label: 'Pending Collection (₹)' },
  ].map(item => {
    const row: any[] = [item.label];
    weeklyMetrics.forEach(m => {
      const val = (m[item.key as keyof WeeklyMetrics] as number) || 0;
      if (item.key === 'sales' || item.key === 'collection' || item.key === 'pending') {
        row.push(Number(val.toFixed(2)));
      } else if (item.key === 'weight') {
        row.push(Number(val.toFixed(2)));
      } else {
        row.push(val);
      }
    });
    const totalVal = (totalMetrics[item.key as keyof WeeklyMetrics] as number) || 0;
    if (item.key === 'sales' || item.key === 'collection' || item.key === 'pending') {
      row.push(Number(totalVal.toFixed(2)));
    } else if (item.key === 'weight') {
      row.push(Number(totalVal.toFixed(2)));
    } else {
      row.push(totalVal);
    }
    return row;
  });
  summaryRows.forEach(row => wsData.push(row));

  wsData.push([]);

  // Expenses Table
  wsData.push(['EXPENSES']);
  const expenseHeaders = ['Expense', ...weeklyGroups.map(g => g.label), 'Total'];
  wsData.push(expenseHeaders);

  const expenseRows = [
    { key: 'farm', label: 'Farm Payment (₹)' },
    { key: 'fuel', label: 'Fuel Payment (₹)' },
    { key: 'trip', label: 'Trip Expenses (₹)' },
    { key: 'salary', label: 'Salaries (₹)' },
    { key: 'maintenance', label: 'Vehicle Maintenance (₹)' },
    { key: 'office', label: 'Office & Other Expenses (₹)' },
  ].map(item => {
    const row: any[] = [item.label];
    weeklyExpenses.forEach(w => {
      const val = (w[item.key as keyof ExpenseBreakdown] as number) || 0;
      row.push(Number(val.toFixed(2)));
    });
    const totalVal = (totalExpenses[item.key as keyof ExpenseBreakdown] as number) || 0;
    row.push(Number(totalVal.toFixed(2)));
    return row;
  });

  // Total Expenses row
  const totalExpRow: any[] = ['Total Expenses (₹)'];
  weeklyExpenses.forEach(w => {
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    totalExpRow.push(Number(sum.toFixed(2)));
  });
  totalExpRow.push(Number(Object.values(totalExpenses).reduce((a, b) => a + b, 0).toFixed(2)));
  expenseRows.push(totalExpRow);

  // Net Profit row
  const netProfitRow: any[] = ['Net Profit (₹)'];
  weeklyMetrics.forEach((m, idx) => {
    const totalExp = Object.values(weeklyExpenses[idx] || {}).reduce((a, b) => a + b, 0);
    const profit = m.sales - totalExp;
    netProfitRow.push(Number(profit.toFixed(2)));
  });
  netProfitRow.push(Number((totalMetrics.sales - Object.values(totalExpenses).reduce((a, b) => a + b, 0)).toFixed(2)));
  expenseRows.push(netProfitRow);

  expenseRows.forEach(row => wsData.push(row));

  wsData.push([]);
  wsData.push([`Generated on: ${new Date().toLocaleString()}`]);
  wsData.push(['All amounts are calculated based on the selected date range.']);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [{ wch: 30 }, ...weeklyGroups.map(() => ({ wch: 18 })), { wch: 15 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Business Summary');
  XLSX.writeFile(wb, `${title.replace(/\s/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
};