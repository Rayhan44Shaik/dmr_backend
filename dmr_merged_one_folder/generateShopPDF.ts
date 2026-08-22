// src/modules/operations/vehicle-trips/utils/generateShopPDF.ts
//
// DMR POULTRY — Clean Black & White Delivery Receipt PDF
// Minimalist, high-legibility A4 format supporting Box Mode & Weight Mode.
// Uses the shared branded DMR POULTRIES letterhead (drawDmrPoultryHeader).

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { BoxDetail } from "../types/trip";
import type { ShopDeliveryWithExtra } from "../components/Step_4/useShopDeliveryForm";

import henImage from "../../../../assets/dmr-hen.jpg";

import {
  drawPreparedDmrPoultryHeader,
  prepareDmrPoultryHeaderAssets,
  type DmrPoultryHeaderAssets,
} from "../../../../utils/drawDmrPoultryHeader";

type RGB = [number, number, number];

const COLOR = {
  black: [0, 0, 0] as RGB,
  textDark: [20, 20, 20] as RGB,
  textMuted: [90, 90, 90] as RGB,
  tableHeader: [35, 35, 35] as RGB,
  borderLight: [200, 200, 200] as RGB,
  cardBg: [250, 250, 250] as RGB,
  tableAltRow: [248, 248, 248] as RGB,
  totalBg: [235, 235, 235] as RGB,
  white: [255, 255, 255] as RGB,
  finalDarkBlue: [22, 38, 66] as RGB,
  finalDarkRed: [142, 30, 30] as RGB,
  accentRed: [142, 30, 30] as RGB,
};

const setFill = (doc: jsPDF, c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
const setDraw = (doc: jsPDF, c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
const setText = (doc: jsPDF, c: RGB) => doc.setTextColor(c[0], c[1], c[2]);

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function getBoxKey(box: any): number {
  return toNum(box.boxNo ?? box.boxId ?? box.boxNumber ?? box.id);
}

function drawField(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  labelWidth: number,
  lineWidth: number
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  setText(doc, COLOR.textDark);
  doc.text(label, x, y);
  doc.text(":", x + labelWidth - 3, y);

  const valueX = x + labelWidth;
  doc.setFont("helvetica", "normal");
  doc.text(value || "", valueX, y);

  setDraw(doc, COLOR.borderLight);
  doc.setLineWidth(0.25);
  doc.line(valueX, y + 1.5, valueX + lineWidth, y + 1.5);
}

export async function generateShopPDFBlob(
  row: ShopDeliveryWithExtra,
  safeBoxDetails: BoxDetail[] = [],
  _tripNo?: string,
  vehicleNo?: string,
  supervisorName?: string,
  supervisorPhone?: string,
  tripDate?: string,
  _logoLeftUrl?: string,
  _henIconUrl?: string,
  deliveryTime?: string,
  driverName?: string
): Promise<Blob> {
  try {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    doc.setProperties({
      title: "Delivery Receipt",
      subject: "DMR POULTRIES delivery receipt",
      author: "DMR POULTRIES",
      creator: "DMR POULTRIES",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - margin * 2;

    const isBoxMode = row.deliveryMode === "box";

    const resolvedSupervisorName =
      supervisorName ||
      (row as any).supervisorName ||
      (row as any).supervisor ||
      "";

    const resolvedDriverName =
      driverName ||
      (row as any).driverName ||
      (row as any).driver ||
      "";

    let resolvedSupervisorPhone =
      supervisorPhone ||
      (row as any).supervisorPhone ||
      (row as any).supervisorMobile ||
      (row as any).supervisorPhoneNo ||
      (row as any).phone ||
      (row as any).employee?.phoneNumber ||
      "";

    if (!resolvedSupervisorPhone && resolvedSupervisorName) {
      try {
        const empStorage = localStorage.getItem("dmr-employees");
        if (empStorage) {
          const employees = JSON.parse(empStorage);
          const matchedEmp = employees.find(
            (emp: any) =>
              emp.employeeName?.trim().toLowerCase() === resolvedSupervisorName.trim().toLowerCase()
          );
          if (matchedEmp && matchedEmp.phoneNumber) {
            resolvedSupervisorPhone = matchedEmp.phoneNumber;
          }
        }
      } catch (err) {
        console.error("Error looking up supervisor phone from employee master:", err);
      }
    }

    const storedDeliveryTime =
      (row as any).autoCaptureTime ||
      (row as any).deliveredAt ||
      (row as any).deliveryTime ||
      (row as any).deliveryTimestamp ||
      (row as any).timestamp ||
      (row as any).createdAt ||
      (row as any).date ||
      (row as any).time ||
      deliveryTime;

    let dateValue = tripDate || "";
    let timeValue = "";

    if (storedDeliveryTime) {
      if (typeof storedDeliveryTime === "string" && storedDeliveryTime.includes(",")) {
        const parts = storedDeliveryTime.split(",");
        dateValue = parts[0].trim();
        timeValue = parts[1].trim();
      } else if (typeof storedDeliveryTime === "string") {
        timeValue = storedDeliveryTime;
      } else {
        const parsedDate = new Date(storedDeliveryTime);
        if (!isNaN(parsedDate.getTime())) {
          dateValue = parsedDate.toLocaleDateString();
          timeValue = parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        }
      }
    }

    if (!dateValue) {
      dateValue = new Date().toLocaleDateString();
    }
    if (!timeValue) {
      timeValue = "Just now";
    }

    const assets: DmrPoultryHeaderAssets =
      await prepareDmrPoultryHeaderAssets({
        henUrl: henImage,
      });

    const headerBottom = drawPreparedDmrPoultryHeader(
      doc,
      {
        margin,
        top: 7,
      },
      assets
    );

    let currentY = headerBottom + 2;

    const c1 = margin + 6;
    const c2 = margin + 98;
    const shopEmail =
      String((row as { shopEmail?: string; email?: string }).shopEmail || (row as { email?: string }).email || "").trim();
    const cardH = shopEmail ? 52 : 44;

    setFill(doc, COLOR.cardBg);
    setDraw(doc, COLOR.borderLight);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, currentY, contentWidth, cardH, 2, 2, "FD");

    drawField(doc, "Supervisor Name", resolvedSupervisorName, c1, currentY + 9, 34, 48);
    drawField(doc, "Vehicle No", vehicleNo || "", c2, currentY + 9, 30, 48);
    drawField(doc, "Supervisor Mobile No", resolvedSupervisorPhone, c1, currentY + 18, 40, 42);
    drawField(doc, "Driver Name", resolvedDriverName, c2, currentY + 18, 30, 48);

    setDraw(doc, COLOR.borderLight);
    doc.line(margin + 2, currentY + 23, pageWidth - margin - 2, currentY + 23);

    drawField(doc, "Shop Name", row.shopName || "", c1, currentY + 31, 34, 48);
    drawField(doc, "Date", dateValue, c2, currentY + 31, 30, 48);
    const typeY = shopEmail ? currentY + 45 : currentY + 38;
    if (shopEmail) {
      drawField(doc, "Shop Email", shopEmail, c1, currentY + 38, 34, 48);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setText(doc, COLOR.textDark);
    doc.text("Delivery Type", c1, typeY);
    doc.text(":", c1 + 30, typeY);

    setDraw(doc, COLOR.black);
    doc.setLineWidth(0.4);
    doc.rect(c1 + 34, typeY - 2.5, 3.5, 3.5, "S");
    if (!isBoxMode) {
      doc.setLineWidth(0.6);
      doc.line(c1 + 34.8, typeY - 0.8, c1 + 35.6, typeY + 0.3);
      doc.line(c1 + 35.6, typeY + 0.3, c1 + 37.1, typeY - 1.9);
    }
    doc.setFont("helvetica", "normal");
    doc.text("Weight", c1 + 39, typeY);

    doc.setLineWidth(0.4);
    doc.rect(c1 + 55, typeY - 2.5, 3.5, 3.5, "S");
    if (isBoxMode) {
      doc.setLineWidth(0.6);
      doc.line(c1 + 55.8, typeY - 0.8, c1 + 56.6, typeY + 0.3);
      doc.line(c1 + 56.6, typeY + 0.3, c1 + 58.1, typeY - 1.9);
    }
    doc.setFont("helvetica", "normal");
    doc.text("Box", c1 + 60, typeY);

    drawField(doc, "Time", timeValue, c2, typeY, 30, 48);

    currentY += cardH + 8;

    const headers = isBoxMode
      ? ["Box No", "Birds Delivered", "Weight (Kg)"]
      : ["Box No", "Birds Delivered", "Delivered Weight (Kg)"];

    const tableRows: (string | number)[][] = [];
    let totalBirds = 0;
    let totalWeight = 0;

    const shopDeliveredWeight = toNum(
      (row as any).deliveredWeight ??
      (row as any).totalWeight ??
      (row as any).weightKg ??
      (row as any).weight ??
      0
    );

    const selectedIds: number[] = (row.selectedBoxIds || [])
      .map((id: any) => toNum(id))
      .filter((n: number) => !Number.isNaN(n));

    const resolvedBoxes = (safeBoxDetails || [])
      .map((b: any) => ({
        key: getBoxKey(b),
        boxNo: b.boxNo ?? b.boxId ?? b.boxNumber ?? b.id,
        birds: toNum(b.birds ?? b.birdsCount ?? b.noOfBirds ?? b.birdCount ?? 0),
        weight: toNum(b.weight ?? b.netWeight ?? b.farmWeight ?? b.weightKg ?? 0),
      }))
      .filter((b) => selectedIds.includes(b.key));

    const perBox = Array.isArray(row.perBoxData) ? row.perBoxData : [];

    if (perBox.length > 0) {
      perBox.forEach((item: any) => {
        const bNo = item.boxNo ?? item.boxNumber ?? item.boxId ?? item.id ?? "—";
        const birds = toNum(item.birds ?? item.birdCount ?? item.noOfBirds ?? 0);
        const weight = toNum(item.weight ?? item.weightKg ?? item.deliveredWeight ?? 0);
        tableRows.push([String(bNo), birds.toLocaleString(), weight.toFixed(2)]);
        totalBirds += birds;
        totalWeight += weight;
      });
    } else if (resolvedBoxes.length > 0) {
      if (isBoxMode) {
        // Box Mode: each selected box delivers its full farm load to the shop.
        // Mortality is tracked at the shop level (row.mortality / row.mortKg),
        // NOT distributed per-box. Keep gross per-box values synced with Step 4.
        resolvedBoxes.forEach((b) => {
          tableRows.push([String(b.boxNo), b.birds.toLocaleString(), b.weight.toFixed(2)]);
          totalBirds += b.birds;
          totalWeight += b.weight;
        });
      } else {
        const totalFarmWeight = resolvedBoxes.reduce((acc, b) => acc + b.weight, 0);
        const totalBoxBirds = resolvedBoxes.reduce((acc, b) => acc + b.birds, 0);
        const targetTotalWeight = shopDeliveredWeight > 0 ? shopDeliveredWeight : totalFarmWeight;

        resolvedBoxes.forEach((item) => {
          let boxDeliveredWt = 0;
          if (totalFarmWeight > 0) {
            boxDeliveredWt = (item.weight / totalFarmWeight) * targetTotalWeight;
          } else if (totalBoxBirds > 0) {
            boxDeliveredWt = (item.birds / totalBoxBirds) * targetTotalWeight;
          } else {
            boxDeliveredWt = targetTotalWeight / resolvedBoxes.length;
          }

          tableRows.push([String(item.boxNo), item.birds.toLocaleString(), boxDeliveredWt.toFixed(2)]);
          totalBirds += item.birds;
        });
        totalWeight = targetTotalWeight;
      }
    } else if (selectedIds.length > 0) {
      const n = selectedIds.length;
      const birdsEach = Math.floor((toNum(row.birds) || 0) / n);
      const weightEach = (toNum(row.weight) || 0) / n;
      selectedIds.forEach((id) => {
        tableRows.push([String(id), birdsEach.toLocaleString(), weightEach.toFixed(2)]);
        totalBirds += birdsEach;
        totalWeight += weightEach;
      });
    } else {
      tableRows.push(["—", "—", "—"]);
    }

    const hasPlaceholder = tableRows.length === 1 && tableRows[0][0] === "—";
    const boxCount = hasPlaceholder ? 0 : tableRows.length;

    if (!isBoxMode && boxCount > 0) {
      tableRows.push([
        `TOTAL (${boxCount} Boxes)`,
        totalBirds.toLocaleString(),
        totalWeight.toFixed(2),
      ]);
    }

    autoTable(doc, {
      startY: currentY,
      head: [headers],
      body: tableRows,
      theme: "grid",
      margin: { left: margin, right: margin },
      showHead: "everyPage",
      rowPageBreak: "avoid",
      headStyles: {
        fillColor: COLOR.tableHeader,
        textColor: COLOR.white,
        fontStyle: "bold",
        fontSize: 9.5,
        halign: "center",
        valign: "middle",
        cellPadding: { top: 3.5, bottom: 3.5 },
        lineColor: COLOR.tableHeader,
        lineWidth: 0.1,
      },
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: { top: 2.5, bottom: 2.5 },
        valign: "middle",
        halign: "center",
        textColor: COLOR.textDark,
        lineColor: COLOR.borderLight,
        lineWidth: 0.2,
      },
      columnStyles: {
        0: { halign: "center", cellWidth: contentWidth * 0.3 },
        1: { halign: "center", cellWidth: contentWidth * 0.35 },
        2: { halign: "center" },
      },
      alternateRowStyles: { fillColor: COLOR.tableAltRow },
      didParseCell: (data) => {
        if (
          !isBoxMode &&
          boxCount > 0 &&
          data.section === "body" &&
          data.row.index === tableRows.length - 1
        ) {
          data.cell.styles.fillColor = COLOR.totalBg;
          data.cell.styles.textColor = COLOR.black;
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fontSize = 9.5;
          if (data.column.index === 0) data.cell.styles.halign = "left";
        }
      },
    });

    let finalY = (doc as any).lastAutoTable?.finalY ?? currentY + 40;

    if (isBoxMode) {
      finalY += 4;

      const mortalityBirdsVal = toNum(
        (row as any).mortalityBirds ??
        (row as any).mortality ??
        (row as any).deadBirds ??
        0
      );

      const mortalityWeightVal = toNum(
        (row as any).mortalityWeight ??
        (row as any).mortalityKg ??
        (row as any).mortalityWt ??
        (row as any).deadWeight ??
        (row as any).mortKg ??
        0
      );

      // totalBirds/totalWeight are gross farm values in Box Mode.
      // Delivered figures = gross - mortality, exactly as computed in Step 4.
      const finalBirdsVal = Math.max(0, totalBirds - mortalityBirdsVal);
      const finalWeightVal = Math.max(0, totalWeight - mortalityWeightVal);

      const summaryHeaders = ["Boxes", "Birds", "Weight(Kg)", "Mortality", "Mortality(KG)"];
      const summaryRows = [
        [
          boxCount,
          totalBirds.toLocaleString(),
          totalWeight.toFixed(2),
          mortalityBirdsVal,
          mortalityWeightVal.toFixed(2)
        ],
        [
          {
            colSpan: 5,
            content: `Delivered Birds: ${finalBirdsVal}  |  Delivered Weight: ${finalWeightVal.toFixed(2)} kg`,
          } as any,
          "",
          "",
          "",
          "",
        ],
      ];

      autoTable(doc, {
        startY: finalY,
        head: [summaryHeaders],
        body: summaryRows,
        theme: "grid",
        margin: { left: margin, right: margin },
        showHead: "everyPage",
        rowPageBreak: "avoid",
        headStyles: {
          fillColor: COLOR.tableHeader,
          textColor: COLOR.white,
          fontStyle: "bold",
          fontSize: 8.5,
          halign: "center",
          valign: "middle",
          cellPadding: { top: 2.5, bottom: 2.5 },
          lineColor: COLOR.tableHeader,
          lineWidth: 0.1,
        },
        styles: {
          font: "helvetica",
          fontSize: 8.5,
          cellPadding: { top: 2, bottom: 2 },
          valign: "middle",
          halign: "center",
          textColor: COLOR.textDark,
          lineColor: COLOR.borderLight,
          lineWidth: 0.2,
        },
        columnStyles: {
          0: { cellWidth: contentWidth * 0.18 },
          1: { cellWidth: contentWidth * 0.20 },
          2: { cellWidth: contentWidth * 0.22 },
          3: { cellWidth: contentWidth * 0.20 },
          4: { cellWidth: contentWidth * 0.20 },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.row.index === 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = COLOR.totalBg;
            data.cell.styles.textColor = COLOR.finalDarkBlue;
          }
        },
      });

      finalY = (doc as any).lastAutoTable?.finalY ?? finalY + 20;
    }

    const thanksY = Math.min(Math.max(finalY + 12, pageHeight - 32), pageHeight - 24);

    setDraw(doc, COLOR.finalDarkBlue);
    doc.setLineWidth(0.4);
    doc.line(margin + 8, thanksY + 3, pageWidth / 2 - 28, thanksY + 3);
    doc.line(pageWidth / 2 + 28, thanksY + 3, pageWidth - margin - 8, thanksY + 3);

    setFill(doc, COLOR.accentRed);
    doc.circle(pageWidth / 2 - 24, thanksY + 3, 1, "F");
    doc.circle(pageWidth / 2 - 21, thanksY + 2.2, 0.75, "F");
    doc.circle(pageWidth / 2 - 21, thanksY + 3.8, 0.75, "F");

    doc.circle(pageWidth / 2 + 24, thanksY + 3, 1, "F");
    doc.circle(pageWidth / 2 + 21, thanksY + 2.2, 0.75, "F");
    doc.circle(pageWidth / 2 + 21, thanksY + 3.8, 0.75, "F");

    doc.setFont("times", "italic");
    doc.setFontSize(15);
    setText(doc, COLOR.finalDarkBlue);
    doc.text("Thank You!", pageWidth / 2, thanksY + 4.5, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(doc, COLOR.textDark);
    doc.text("We appreciate your business", pageWidth / 2, thanksY + 10, { align: "center" });

    return doc.output("blob");
  } catch (error: any) {
    throw new Error(error?.message || "Failed to generate PDF receipt.");
  }
}

export async function generateShopPDF(
  row: ShopDeliveryWithExtra,
  safeBoxDetails: BoxDetail[] = [],
  _tripNo?: string,
  vehicleNo?: string,
  supervisorName?: string,
  supervisorPhone?: string,
  tripDate?: string,
  _logoLeftUrl?: string,
  _henIconUrl?: string,
  deliveryTime?: string,
  driverName?: string
): Promise<void> {
  const pdfBlob = await generateShopPDFBlob(
    row,
    safeBoxDetails,
    _tripNo,
    vehicleNo,
    supervisorName,
    supervisorPhone,
    tripDate,
    _logoLeftUrl,
    _henIconUrl,
    deliveryTime,
    driverName
  );
  const isBoxMode = row.deliveryMode === "box";
  const suffix = isBoxMode ? "Box" : "Weight";
  const cleanShopName = (row.shopName || "Shop").replace(/\s+/g, "_");
  const blobUrl = window.URL.createObjectURL(pdfBlob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `DeliveryReceipt_${cleanShopName}_${suffix}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
}