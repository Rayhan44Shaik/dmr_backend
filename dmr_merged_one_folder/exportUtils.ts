// src/utils/exportUtils.ts

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

/**
 * Generates and downloads an extremely polished, professional, and visually attractive PDF document.
 */
export const exportToPDF = (
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string
): void => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primaryColor = [37, 99, 235]; // Deep professional blue (#2563eb)
  const secondaryColor = [71, 85, 105]; // Slate gray (#475569)

  // ---------------------------------------------------------------------------
  // 1. Decorative Header Accent Bar
  // ---------------------------------------------------------------------------
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, pageWidth, 6, 'F');

  // ---------------------------------------------------------------------------
  // 2. Organization / Brand Header Block
  // ---------------------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42); // Dark slate (#0f172a)
  doc.text(title, 14, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('Business Analytics & Performance Report', 14, 28);

  // Metadata block (Right aligned)
  const currentDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('GENERATED ON:', pageWidth - 14, 20, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.text(currentDate, pageWidth - 14, 25, { align: 'right' });

  // ---------------------------------------------------------------------------
  // 3. Divider Line
  // ---------------------------------------------------------------------------
  doc.setDrawColor(226, 232, 240); // Border color (#e2e8f0)
  doc.setLineWidth(0.5);
  doc.line(14, 34, pageWidth - 14, 34);

  // ---------------------------------------------------------------------------
  // 4. Data Table Configuration with autoTable
  // ---------------------------------------------------------------------------
  autoTable(doc, {
    startY: 40,
    head: [headers],
    body: rows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: 6,
      textColor: [30, 41, 59], // Slate 800
      lineColor: [226, 232, 240], // Light grid borders
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [37, 99, 235], // Primary Blue Header
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: 7,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // Subtle zebra striping
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 'auto' },
    },
    didDrawPage: (data) => {
      // -----------------------------------------------------------------------
      // 5. Professional Footer on Every Page
      // -----------------------------------------------------------------------
      const pageCount = doc.internal.pages.length - 1;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184); // Muted slate

      // Footer divider line
      doc.setDrawColor(241, 245, 249);
      doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);

      // Left-aligned footer note
      doc.text('Confidential Business Report • Generated Automatically', 14, pageHeight - 10);

      // Right-aligned page number
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageWidth - 14,
        pageHeight - 10,
        { align: 'right' }
      );
    },
  });

  // Save the PDF file
  doc.save(`${filename}.pdf`);
};

/**
 * Generates and downloads a clean, formatted Excel sheet.
 */
export const exportToExcel = (
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string
): void => {
  const worksheetData = [
    [title],
    [], // Blank row
    headers,
    ...rows,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report Summary');

  // Trigger download
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};