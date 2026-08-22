import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface ExportOptions {
  fileName: string;
  headers: string[];
  rows: any[][];
  title?: string;
}

export const exportToPDF = ({ fileName, headers, rows, title }: ExportOptions): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 20;

  // Title
  doc.setFontSize(16);
  doc.setTextColor(30, 58, 138);
  doc.text(title || fileName, pageWidth / 2, y, { align: 'center' });
  y += 10;

  // Date
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 10;

  // Table
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: y,
    theme: 'striped',
    headStyles: { 
      fillColor: [30, 58, 138], 
      textColor: 255, 
      fontStyle: 'bold',
      halign: 'center',
    },
    styles: { fontSize: 8, cellPadding: 2 },
    alternateRowStyles: { fillColor: [240, 242, 245] },
    margin: { left: margin, right: margin },
  });

  doc.save(`${fileName}.pdf`);
};

export const exportToExcel = ({ fileName, headers, rows }: ExportOptions): void => {
  const data = rows.map(row => {
    const obj: Record<string, any> = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || '';
    });
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  
  // Set column widths
  const colWidths = headers.map(() => ({ wch: 20 }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};

export const exportFleetReport = (
  data: any[],
  reportType: string,
  format: 'pdf' | 'excel',
  headers?: string[]
): void => {
  const fileName = `${reportType}_Report_${new Date().toISOString().split('T')[0]}`;
  const defaultHeaders = Object.keys(data[0] || {});
  const exportHeaders = headers || defaultHeaders;
  const rows = data.map(item => exportHeaders.map(h => item[h] || ''));

  const options: ExportOptions = {
    fileName,
    headers: exportHeaders,
    rows,
    title: `${reportType} Report`,
  };

  if (format === 'pdf') {
    exportToPDF(options);
  } else {
    exportToExcel(options);
  }
};