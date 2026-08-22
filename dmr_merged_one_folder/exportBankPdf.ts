import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import henImage from "../../../../assets/dmr-hen.jpg";

import {
  drawPreparedDmrPoultryHeader,
  prepareDmrPoultryHeaderAssets,
  type DmrPoultryHeaderAssets,
} from "../../../../utils/drawDmrPoultryHeader";

import type { Bank } from "../types/bank";

type RGB = [number, number, number];

const COLOR = {
  navy: [15, 35, 79] as RGB,
  red: [178, 20, 34] as RGB,
  slate: [71, 85, 105] as RGB,
  muted: [100, 116, 139] as RGB,
  border: [218, 226, 237] as RGB,
  header: [20, 50, 99] as RGB,
  headerAccent: [178, 20, 34] as RGB,
  white: [255, 255, 255] as RGB,
  rowAlt: [247, 249, 252] as RGB,
  summaryBg: [248, 250, 252] as RGB,
  activeText: [21, 128, 61] as RGB,
  activeBg: [220, 252, 231] as RGB,
  inactiveText: [185, 28, 28] as RGB,
  inactiveBg: [254, 226, 226] as RGB,
};

const PAGE_MARGIN = 14;

/**
 * Shared letterhead ends at approximately 41 mm when top is 7.
 * The summary section ends around 60 mm.
 */
const TABLE_START_Y = 66;

/**
 * Portrait A4 width:
 *
 * 210 mm - 14 mm left margin - 14 mm right margin = 182 mm.
 *
 * Column widths:
 *
 * 14 + 34 + 26 + 34 + 27 + 29 + 18 = 182 mm.
 */
const TABLE_WIDTH = 182;

function setText(
  doc: jsPDF,
  color: RGB,
): void {
  doc.setTextColor(
    color[0],
    color[1],
    color[2],
  );
}

function setFill(
  doc: jsPDF,
  color: RGB,
): void {
  doc.setFillColor(
    color[0],
    color[1],
    color[2],
  );
}

function setDraw(
  doc: jsPDF,
  color: RGB,
): void {
  doc.setDrawColor(
    color[0],
    color[1],
    color[2],
  );
}

function formatGeneratedAt(
  date: Date,
): string {
  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    },
  ).format(date);
}

function getSafeFilename(
  filename: string,
): string {
  const cleaned =
    filename.trim() ||
    `Banks_${new Date()
      .toISOString()
      .slice(0, 10)}`;

  return cleaned
    .toLowerCase()
    .endsWith(".pdf")
    ? cleaned
    : `${cleaned}.pdf`;
}

function drawMetric(
  doc: jsPDF,
  label: string,
  value: number,
  x: number,
  y: number,
  width: number,
  valueColor: RGB,
): void {
  setFill(doc, COLOR.white);
  setDraw(doc, COLOR.border);

  doc.setLineWidth(0.25);

  doc.roundedRect(
    x,
    y,
    width,
    14,
    2,
    2,
    "FD",
  );

  doc.setFont(
    "helvetica",
    "bold",
  );

  doc.setFontSize(11);

  setText(doc, valueColor);

  doc.text(
    String(value),
    x + 4,
    y + 6.2,
  );

  doc.setFontSize(6.4);
  setText(doc, COLOR.muted);

  doc.text(
    label.toUpperCase(),
    x + 4,
    y + 10.7,
    {
      charSpace: 0.35,
    },
  );
}

/**
 * Draws the common DMR POULTRIES letterhead and the Bank summary section.
 *
 * Letterhead layout:
 * - Left: proprietor, mobile and office address
 * - Centre: DMR POULTRIES
 * - Right: hen image
 *
 * No left-side logo and no Banks Master Directory subtitle.
 */
function drawPageHeader(
  doc: jsPDF,
  banks: readonly Bank[],
  generatedAt: string,
  assets: DmrPoultryHeaderAssets,
): void {
  const pageWidth =
    doc.internal.pageSize.getWidth();

  const activeCount =
    banks.filter(
      (bank) =>
        bank.status === "Active",
    ).length;

  const inactiveCount =
    banks.length - activeCount;

  const headerBottom =
    drawPreparedDmrPoultryHeader(
      doc,
      {
        margin: PAGE_MARGIN,
        top: 7,
      },
      assets,
    );

  const summaryY =
    headerBottom + 1;

  setFill(doc, COLOR.summaryBg);
  setDraw(doc, COLOR.border);

  doc.setLineWidth(0.3);

  doc.roundedRect(
    PAGE_MARGIN,
    summaryY,
    pageWidth -
      PAGE_MARGIN * 2,
    18,
    2.5,
    2.5,
    "FD",
  );

  doc.setFont(
    "helvetica",
    "bold",
  );

  doc.setFontSize(10.5);
  setText(doc, COLOR.navy);

  doc.text(
    "Bank Accounts & Payment Directory",
    PAGE_MARGIN + 5,
    summaryY + 7,
  );

  doc.setFont(
    "helvetica",
    "normal",
  );

  doc.setFontSize(7.2);
  setText(doc, COLOR.muted);

  doc.text(
    `Generated: ${generatedAt}`,
    PAGE_MARGIN + 5,
    summaryY + 12.5,
  );

  const metricWidth = 27;
  const metricGap = 3;

  const metricsStartX =
    pageWidth -
    PAGE_MARGIN -
    metricWidth * 3 -
    metricGap * 2 -
    3;

  drawMetric(
    doc,
    "Total",
    banks.length,
    metricsStartX,
    summaryY + 2,
    metricWidth,
    COLOR.navy,
  );

  drawMetric(
    doc,
    "Active",
    activeCount,
    metricsStartX +
      metricWidth +
      metricGap,
    summaryY + 2,
    metricWidth,
    COLOR.activeText,
  );

  drawMetric(
    doc,
    "Inactive",
    inactiveCount,
    metricsStartX +
      (metricWidth + metricGap) *
        2,
    summaryY + 2,
    metricWidth,
    COLOR.inactiveText,
  );
}

/**
 * Draws page numbers after AutoTable has generated all pages.
 */
function drawFooters(
  doc: jsPDF,
  generatedAt: string,
): void {
  const pageWidth =
    doc.internal.pageSize.getWidth();

  const pageHeight =
    doc.internal.pageSize.getHeight();

  const totalPages =
    doc.getNumberOfPages();

  const footerTextY =
    pageHeight - 6;

  const footerLineY =
    pageHeight - 10;

  for (
    let pageNumber = 1;
    pageNumber <= totalPages;
    pageNumber += 1
  ) {
    doc.setPage(pageNumber);

    setDraw(doc, COLOR.border);

    doc.setLineWidth(0.25);

    doc.line(
      PAGE_MARGIN,
      footerLineY,
      pageWidth - PAGE_MARGIN,
      footerLineY,
    );

    doc.setFont(
      "helvetica",
      "normal",
    );

    doc.setFontSize(7.2);
    setText(doc, COLOR.muted);

    doc.text(
      "DMR POULTRIES • Confidential",
      PAGE_MARGIN,
      footerTextY,
    );

    doc.text(
      generatedAt,
      pageWidth / 2,
      footerTextY,
      {
        align: "center",
      },
    );

    doc.setFont(
      "helvetica",
      "bold",
    );

    setText(doc, COLOR.navy);

    doc.text(
      `Page ${pageNumber} of ${totalPages}`,
      pageWidth - PAGE_MARGIN,
      footerTextY,
      {
        align: "right",
      },
    );
  }
}

/**
 * Generates and downloads the branded Bank directory PDF.
 *
 * The function is asynchronous because the hen image is prepared before
 * drawing the PDF. It is prepared once and reused on every page.
 */
export async function exportBankPdf(
  banks: readonly Bank[],
  filename: string,
): Promise<void> {
  if (banks.length === 0) {
    throw new Error(
      "No bank records are available to export.",
    );
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });

  doc.setProperties({
    title:
      "Bank Accounts & Payment Directory",
    subject:
      "DMR POULTRIES Bank accounts and payment directory",
    author: "DMR POULTRIES",
    creator: "DMR POULTRIES",
  });

  const generatedAt =
    formatGeneratedAt(
      new Date(),
    );

  /**
   * Correct path from:
   *
   * src/modules/masters/banks/utils/exportBankPdf.ts
   *
   * to:
   *
   * src/assets/dmr-hen.jpg
   */
  const assets =
    await prepareDmrPoultryHeaderAssets({
      henUrl: henImage,
    });

  const sortedBanks = [
    ...banks,
  ].sort(
    (first, second) =>
      first.bankNo -
      second.bankNo,
  );

  const rows =
    sortedBanks.map(
      (bank) => [
        String(bank.bankNo),
        bank.bankName.trim(),
        bank.branch.trim(),
        bank.accountNumber.trim(),
        bank.ifscCode
          .trim()
          .toUpperCase(),
        bank.upiId?.trim() ||
          "-",
        bank.status,
      ],
    );

  autoTable(doc, {
    startY: TABLE_START_Y,

    margin: {
      top: TABLE_START_Y,
      right: PAGE_MARGIN,
      bottom: 17,
      left: PAGE_MARGIN,
    },

    tableWidth: TABLE_WIDTH,

    head: [
      [
        "BANK NO",
        "BANK NAME",
        "BRANCH",
        "ACCOUNT NUMBER",
        "IFSC CODE",
        "UPI ID",
        "STATUS",
      ],
    ],

    body: rows,

    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",

    styles: {
      font: "helvetica",
      fontSize: 7,
      minCellHeight: 7,

      cellPadding: {
        top: 1.8,
        right: 1.6,
        bottom: 1.8,
        left: 1.6,
      },

      valign: "middle",
      textColor: COLOR.slate,
      lineColor: COLOR.border,
      lineWidth: 0.15,
      overflow: "linebreak",
    },

    headStyles: {
      fillColor: COLOR.header,
      textColor: COLOR.white,
      fontStyle: "bold",
      fontSize: 6.6,
      minCellHeight: 9,
      halign: "left",
      valign: "middle",
      lineColor: [
        61,
        83,
        123,
      ],
      lineWidth: 0.2,
    },

    alternateRowStyles: {
      fillColor: COLOR.rowAlt,
    },

    columnStyles: {
      /**
       * Total width:
       *
       * 14 + 34 + 26 + 34 + 27 + 29 + 18 = 182 mm.
       */
      0: {
        cellWidth: 14,
        halign: "center",
        fontStyle: "bold",
        textColor: COLOR.navy,
      },

      1: {
        cellWidth: 34,
        fontStyle: "bold",
        textColor: COLOR.navy,
      },

      2: {
        cellWidth: 26,
      },

      3: {
        cellWidth: 34,
        halign: "center",
      },

      4: {
        cellWidth: 27,
        fontStyle: "bold",
        halign: "center",
      },

      5: {
        cellWidth: 29,
      },

      6: {
        cellWidth: 18,
        halign: "center",
        fontStyle: "bold",
      },
    },

    didParseCell: (data) => {
      if (
        data.section ===
          "head" &&
        data.column.index === 0
      ) {
        data.cell.styles.fillColor =
          COLOR.headerAccent;
      }

      // Hide standard status text because a status badge is drawn below.
      if (
        data.section ===
          "body" &&
        data.column.index === 6
      ) {
        data.cell.text = [];
      }
    },

    didDrawCell: (data) => {
      if (
        data.section !==
          "body" ||
        data.column.index !== 6
      ) {
        return;
      }

      const status =
        String(
          data.cell.raw ??
            "Inactive",
        );

      const isActive =
        status.toLowerCase() ===
        "active";

      const displayStatus =
        isActive
          ? "Active"
          : "Inactive";

      const pillWidth = 15;
      const pillHeight = 5.2;

      const pillX =
        data.cell.x +
        (data.cell.width -
          pillWidth) /
          2;

      const pillY =
        data.cell.y +
        (data.cell.height -
          pillHeight) /
          2;

      setFill(
        doc,
        isActive
          ? COLOR.activeBg
          : COLOR.inactiveBg,
      );

      doc.roundedRect(
        pillX,
        pillY,
        pillWidth,
        pillHeight,
        2.5,
        2.5,
        "F",
      );

      doc.setFont(
        "helvetica",
        "bold",
      );

      doc.setFontSize(5.9);

      setText(
        doc,
        isActive
          ? COLOR.activeText
          : COLOR.inactiveText,
      );

      doc.text(
        displayStatus,
        data.cell.x +
          data.cell.width / 2,
        pillY + 3.55,
        {
          align: "center",
        },
      );
    },

    /**
     * AutoTable reserves TABLE_START_Y on every page.
     *
     * Drawing the header in didDrawPage ensures table content cannot paint
     * over the letterhead.
     */
    didDrawPage: () => {
      drawPageHeader(
        doc,
        sortedBanks,
        generatedAt,
        assets,
      );
    },
  });

  drawFooters(
    doc,
    generatedAt,
  );

  doc.save(
    getSafeFilename(
      filename,
    ),
  );
}

/**
 * Compatibility alias for existing imports.
 */
export const exportBanksToPDF =
  exportBankPdf;