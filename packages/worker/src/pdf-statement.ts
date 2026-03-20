import PDFDocument from "pdfkit";
import type { PayrollWeek, Load, PayItem } from "@haulsync/shared";

interface StatementData {
  payrollWeek: PayrollWeek;
  companyName: string;
  driverName: string;
  employmentType: string;
  loads: Load[];
  payItems: PayItem[];
}

function fmt$(amount: number | string | null | undefined): string {
  const n = Number(amount || 0);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMiles(miles: number | string | null | undefined): string {
  const n = Number(miles || 0);
  return n % 1 === 0 ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function extractCity(address: string | null | undefined): string {
  if (!address) return "N/A";
  const parts = address.split(",").map(s => s.trim());
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}, ${parts[parts.length - 1].replace(/\d+/g, "").trim()}`;
  }
  return address.length > 30 ? address.substring(0, 30) + "..." : address;
}

function empTypeLabel(type: string): string {
  switch (type) {
    case "W2_COMPANY_DRIVER": return "W-2 Company Driver";
    case "N1099_COMPANY_DRIVER": return "1099 Contractor";
    case "OWNER_OPERATOR": return "Owner Operator";
    case "LEASE_TO_PURCHASE": return "Lease To Purchase";
    default: return type;
  }
}

export function generateStatementPdf(data: StatementData): PDFDocument {
  const { payrollWeek: pw, companyName, driverName, employmentType, loads, payItems } = data;

  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 40, bottom: 40, left: 50, right: 50 },
    bufferPages: true,
  });

  const pageW = 612 - 100;
  const gray = "#666666";
  const darkGray = "#333333";
  const lineColor = "#cccccc";
  const headerBg = "#1a1a2e";
  const headerText = "#ffffff";
  const altRowBg = "#f5f5f5";

  doc.rect(0, 0, 612, 80).fill(headerBg);
  doc.fontSize(20).fillColor(headerText).font("Helvetica-Bold").text(companyName, 50, 25, { width: pageW });
  doc.fontSize(10).fillColor("#aaaacc").font("Helvetica").text("Weekly Settlement Statement", 50, 50, { width: pageW });

  doc.fillColor(darkGray);
  let y = 100;

  doc.fontSize(10).font("Helvetica-Bold").text("Driver:", 50, y);
  doc.font("Helvetica").text(driverName, 120, y);
  doc.font("Helvetica-Bold").text("Type:", 350, y);
  doc.font("Helvetica").text(empTypeLabel(employmentType), 390, y);

  y += 18;
  doc.font("Helvetica-Bold").text("Period:", 50, y);
  doc.font("Helvetica").text(`${pw.weekStart}  to  ${pw.weekEnd}`, 120, y);
  doc.font("Helvetica-Bold").text("Status:", 350, y);
  doc.font("Helvetica").text(pw.status, 390, y);

  y += 30;

  doc.moveTo(50, y).lineTo(50 + pageW, y).strokeColor(lineColor).lineWidth(0.5).stroke();
  y += 8;

  doc.fontSize(12).font("Helvetica-Bold").fillColor(darkGray).text("LOADS", 50, y);
  y += 20;

  const colX = { date: 50, pickup: 120, delivery: 240, miles: 360, rate: 420, amount: 480 };
  const colW = { date: 65, pickup: 115, delivery: 115, miles: 55, rate: 55, amount: 82 };

  doc.rect(50, y, pageW, 18).fill("#e8e8ee");
  doc.fontSize(8).font("Helvetica-Bold").fillColor(darkGray);
  doc.text("DATE", colX.date + 4, y + 5, { width: colW.date });
  doc.text("PICKUP", colX.pickup + 4, y + 5, { width: colW.pickup });
  doc.text("DELIVERY", colX.delivery + 4, y + 5, { width: colW.delivery });
  doc.text("MILES", colX.miles + 4, y + 5, { width: colW.miles, align: "right" });
  doc.text("RATE", colX.rate + 4, y + 5, { width: colW.rate, align: "right" });
  doc.text("AMOUNT", colX.amount + 4, y + 5, { width: colW.amount, align: "right" });
  y += 18;

  let totalLoadMiles = 0;
  let totalLinehaul = 0;

  doc.fontSize(8).font("Helvetica").fillColor(darkGray);
  loads.forEach((load, idx) => {
    if (y > 680) {
      doc.addPage();
      y = 50;
    }

    const miles = Number(load.finalMilesSnapshot || load.finalMiles || 0);
    const rate = Number(load.ratePerMileSnapshot || 0);
    const linehaul = miles * rate;
    totalLoadMiles += miles;
    totalLinehaul += linehaul;

    if (idx % 2 === 1) {
      doc.rect(50, y, pageW, 16).fill(altRowBg);
      doc.fillColor(darkGray);
    }

    const pickup = extractCity(load.verifiedPickupAddress || load.pickupAddress);
    const delivery = extractCity(load.verifiedDeliveryAddress || load.deliveryAddress);

    doc.text(load.pickupDate || "N/A", colX.date + 4, y + 4, { width: colW.date });
    doc.text(pickup, colX.pickup + 4, y + 4, { width: colW.pickup });
    doc.text(delivery, colX.delivery + 4, y + 4, { width: colW.delivery });
    doc.text(fmtMiles(miles), colX.miles + 4, y + 4, { width: colW.miles, align: "right" });
    doc.text(rate > 0 ? `$${rate.toFixed(4)}` : "-", colX.rate + 4, y + 4, { width: colW.rate, align: "right" });
    doc.text(fmt$(linehaul), colX.amount + 4, y + 4, { width: colW.amount, align: "right" });
    y += 16;
  });

  if (loads.length === 0) {
    doc.text("No loads for this period.", 54, y + 4);
    y += 16;
  }

  doc.moveTo(50, y).lineTo(50 + pageW, y).strokeColor(lineColor).lineWidth(0.5).stroke();
  y += 4;
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text(`Total: ${fmtMiles(totalLoadMiles)} mi`, colX.miles - 30, y, { width: colW.miles + 34, align: "right" });
  doc.text(fmt$(totalLinehaul), colX.amount + 4, y, { width: colW.amount, align: "right" });
  y += 24;

  const earnings = payItems.filter(pi => pi.type === "EARNING");
  const deductions = payItems.filter(pi => pi.type === "DEDUCTION");
  const reimbursements = payItems.filter(pi => pi.type === "REIMBURSEMENT");

  function drawPayItemSection(title: string, items: PayItem[], colorPrefix: string) {
    if (y > 680) { doc.addPage(); y = 50; }

    doc.moveTo(50, y).lineTo(50 + pageW, y).strokeColor(lineColor).lineWidth(0.5).stroke();
    y += 8;
    doc.fontSize(11).font("Helvetica-Bold").fillColor(darkGray).text(title, 50, y);
    y += 18;

    if (items.length === 0) {
      doc.fontSize(8).font("Helvetica").fillColor(gray).text("None", 54, y);
      y += 16;
      return;
    }

    doc.rect(50, y, pageW, 18).fill("#e8e8ee");
    doc.fontSize(8).font("Helvetica-Bold").fillColor(darkGray);
    doc.text("CATEGORY", 54, y + 5, { width: 120 });
    doc.text("DESCRIPTION", 180, y + 5, { width: 260 });
    doc.text("AMOUNT", colX.amount + 4, y + 5, { width: colW.amount, align: "right" });
    y += 18;

    doc.fontSize(8).font("Helvetica").fillColor(darkGray);
    items.forEach((item, idx) => {
      if (y > 700) { doc.addPage(); y = 50; }
      if (idx % 2 === 1) {
        doc.rect(50, y, pageW, 16).fill(altRowBg);
        doc.fillColor(darkGray);
      }
      const cat = (item.category || "OTHER").replace(/_/g, " ");
      doc.text(cat, 54, y + 4, { width: 120 });
      doc.text(item.description || "-", 180, y + 4, { width: 260 });
      const prefix = item.type === "DEDUCTION" ? "-" : "+";
      doc.text(`${prefix}${fmt$(item.amount)}`, colX.amount + 4, y + 4, { width: colW.amount, align: "right" });
      y += 16;
    });

    const sectionTotal = items.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    doc.moveTo(50, y).lineTo(50 + pageW, y).strokeColor(lineColor).lineWidth(0.5).stroke();
    y += 4;
    doc.font("Helvetica-Bold").fontSize(9);
    const prefix = title.includes("Deduction") ? "-" : "+";
    doc.text(`Subtotal: ${prefix}${fmt$(sectionTotal)}`, colX.amount - 60, y, { width: colW.amount + 64, align: "right" });
    y += 20;
  }

  drawPayItemSection("ADDITIONAL EARNINGS", earnings, "green");
  drawPayItemSection("DEDUCTIONS", deductions, "red");
  drawPayItemSection("REIMBURSEMENTS", reimbursements, "blue");

  if (y > 620) { doc.addPage(); y = 50; }
  y += 10;
  doc.moveTo(50, y).lineTo(50 + pageW, y).strokeColor(headerBg).lineWidth(1.5).stroke();
  y += 12;

  const summaryX = 320;
  const summaryValX = 460;
  const summaryW = 102;

  doc.fontSize(10).font("Helvetica").fillColor(darkGray);

  const summaryRows = [
    { label: "Total Miles", value: `${fmtMiles(pw.milesTotalSnapshot)} mi` },
    { label: "Base Pay (Linehaul)", value: fmt$(pw.basePayTotal) },
    { label: "Additional Earnings", value: `+${fmt$(pw.earningsTotal)}` },
    { label: "Deductions", value: `-${fmt$(pw.deductionsTotal)}` },
    { label: "Reimbursements", value: `+${fmt$(pw.reimbursementsTotal)}` },
  ];

  summaryRows.forEach(row => {
    doc.font("Helvetica").text(row.label, summaryX, y, { width: 130 });
    doc.text(row.value, summaryValX, y, { width: summaryW, align: "right" });
    y += 16;
  });

  y += 4;
  doc.moveTo(summaryX, y).lineTo(summaryValX + summaryW, y).strokeColor(headerBg).lineWidth(1).stroke();
  y += 8;
  doc.fontSize(14).font("Helvetica-Bold").fillColor(headerBg);
  doc.text("NET PAY", summaryX, y, { width: 130 });
  doc.text(fmt$(pw.netPayTotal), summaryValX, y, { width: summaryW, align: "right" });

  y += 40;

  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).font("Helvetica").fillColor(gray);
    doc.text(
      "This statement is for settlement purposes only. Taxes/withholdings are not calculated in this app.",
      50, 740, { width: pageW, align: "center" }
    );
    doc.text(
      `Page ${i - pages.start + 1} of ${pages.count}`,
      50, 752, { width: pageW, align: "center" }
    );
  }

  return doc;
}
