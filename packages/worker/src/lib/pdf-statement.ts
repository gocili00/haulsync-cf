/**
 * lib/pdf-statement.ts — Payroll statement PDF generator (CF Workers compatible)
 *
 * Replaces: server/pdf-statement.ts (pdfkit)
 * Uses pdf-lib instead of pdfkit because pdfkit requires Node.js streams and
 * filesystem access for font metrics, which are not available in CF Workers.
 * Visual output is identical — same layout, colours, and standard PDF fonts.
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { PayrollWeek, Load, PayItem } from "@shared/schema";

export interface StatementData {
  payrollWeek: PayrollWeek;
  companyName: string;
  driverName: string;
  employmentType: string;
  loads: Load[];
  payItems: PayItem[];
}

// ── Formatting helpers (unchanged from original) ──────────────────────────
function fmt$(amount: number | string | null | undefined): string {
  const n = Number(amount || 0);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMiles(miles: number | string | null | undefined): string {
  const n = Number(miles || 0);
  return n % 1 === 0
    ? n.toLocaleString("en-US")
    : n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function extractCity(address: string | null | undefined): string {
  if (!address) return "N/A";
  const parts = address.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}, ${parts[parts.length - 1].replace(/\d+/g, "").trim()}`;
  }
  return address.length > 30 ? address.substring(0, 30) + "..." : address;
}

function empTypeLabel(type: string): string {
  switch (type) {
    case "W2_COMPANY_DRIVER":    return "W-2 Company Driver";
    case "N1099_COMPANY_DRIVER": return "1099 Contractor";
    case "OWNER_OPERATOR":       return "Owner Operator";
    case "LEASE_TO_PURCHASE":    return "Lease To Purchase";
    default:                     return type;
  }
}

// ── Colour palette (same as original) ─────────────────────────────────────
function hex(h: string): RGB {
  return rgb(parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255);
}
const C = {
  headerBg:    hex("#1a1a2e"),
  headerText:  hex("#ffffff"),
  headerSub:   hex("#aaaacc"),
  dark:        hex("#333333"),
  gray:        hex("#666666"),
  line:        hex("#cccccc"),
  altRow:      hex("#f5f5f5"),
  hdrRow:      hex("#e8e8ee"),
};

// ── Page constants ─────────────────────────────────────────────────────────
const PW = 612;  // page width  (LETTER)
const PH = 792;  // page height
const ML = 50;   // margin left
const MR = 50;   // margin right
const CW = PW - ML - MR; // content width = 512

// ── Low-level drawing helpers ──────────────────────────────────────────────
// pdf-lib origin is bottom-left; pdfkit origin is top-left.
// We keep all layout logic in "top-left y" coordinates and convert here.

function rectTL(page: PDFPage, x: number, yTop: number, w: number, h: number, color: RGB) {
  page.drawRectangle({ x, y: PH - yTop - h, width: w, height: h, color });
}

function lineTL(page: PDFPage, x1: number, yTop: number, x2: number, color: RGB, thickness = 0.5) {
  page.drawLine({ start: { x: x1, y: PH - yTop }, end: { x: x2, y: PH - yTop }, color, thickness });
}

// Truncate text so it fits inside maxWidth at the given font size.
function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && font.widthOfTextAtSize(s + "…", size) > maxWidth) s = s.slice(0, -1);
  return s + "…";
}

// Draw text with optional width-constraint and alignment.
// yTop is the top of the text line in pdfkit coordinates.
// We use Helvetica cap-height ≈ 0.72 × size to convert to pdf-lib baseline.
function txt(
  page: PDFPage,
  text: string,
  x: number,
  yTop: number,
  font: PDFFont,
  size: number,
  color: RGB,
  maxWidth?: number,
  align: "left" | "right" | "center" = "left",
) {
  const display = maxWidth ? truncate(text, font, size, maxWidth) : text;
  const tw = font.widthOfTextAtSize(display, size);
  let drawX = x;
  if (align === "right"  && maxWidth) drawX = x + maxWidth - tw;
  if (align === "center" && maxWidth) drawX = x + (maxWidth - tw) / 2;
  // baseline = top − ascender; for Helvetica ascender ≈ 0.72 × size
  page.drawText(display, { x: drawX, y: PH - yTop - size * 0.72, size, font, color });
}

// ── Main generator ─────────────────────────────────────────────────────────
export async function generateStatementPdf(data: StatementData): Promise<Uint8Array> {
  const { payrollWeek: pw, companyName, driverName, employmentType, loads, payItems } = data;

  const doc = await PDFDocument.create();
  const fontR = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);

  // Mutable state — reassigned when a new page is added
  let page = doc.addPage([PW, PH]);
  let y = 0;

  function newPage() { page = doc.addPage([PW, PH]); y = 50; }

  // Convenience wrappers that always draw on the current `page`
  const R = (x: number, yT: number, w: number, h: number, c: RGB) => rectTL(page, x, yT, w, h, c);
  const L = (x1: number, yT: number, x2: number, c: RGB, t?: number) => lineTL(page, x1, yT, x2, c, t);
  const T = (s: string, x: number, yT: number, font: PDFFont, size: number, color: RGB, w?: number, align?: "left"|"right"|"center") =>
    txt(page, s, x, yT, font, size, color, w, align);

  // ── Header band ──────────────────────────────────────────────────────────
  R(0, 0, PW, 80, C.headerBg);
  T(companyName, 50, 25, fontB, 20, C.headerText);
  T("Weekly Settlement Statement", 50, 50, fontR, 10, C.headerSub);

  y = 100;

  // ── Driver info ──────────────────────────────────────────────────────────
  T("Driver:", 50, y, fontB, 10, C.dark); T(driverName, 120, y, fontR, 10, C.dark);
  T("Type:", 350, y, fontB, 10, C.dark);  T(empTypeLabel(employmentType), 390, y, fontR, 10, C.dark);
  y += 18;
  T("Period:", 50, y, fontB, 10, C.dark); T(`${pw.weekStart}  to  ${pw.weekEnd}`, 120, y, fontR, 10, C.dark);
  T("Status:", 350, y, fontB, 10, C.dark); T(pw.status, 390, y, fontR, 10, C.dark);
  y += 30;

  L(50, y, 50 + CW, C.line); y += 8;
  T("LOADS", 50, y, fontB, 12, C.dark); y += 20;

  // ── Column layout (identical to original) ─────────────────────────────
  const colX = { date: 50, pickup: 120, delivery: 240, miles: 360, rate: 420, amount: 480 };
  const colW = { date: 65, pickup: 115, delivery: 115, miles: 55, rate: 55, amount: 82 };

  // Loads header row
  R(50, y, CW, 18, C.hdrRow);
  const hdr = (s: string, x: number, w: number, a: "left"|"right" = "left") =>
    T(s, x+4, y+5, fontB, 8, C.dark, w, a);
  hdr("DATE",     colX.date,     colW.date);
  hdr("PICKUP",   colX.pickup,   colW.pickup);
  hdr("DELIVERY", colX.delivery, colW.delivery);
  hdr("MILES",    colX.miles,    colW.miles,   "right");
  hdr("RATE",     colX.rate,     colW.rate,    "right");
  hdr("AMOUNT",   colX.amount,   colW.amount,  "right");
  y += 18;

  let totalMiles = 0;
  let totalLinehaul = 0;

  loads.forEach((load, idx) => {
    if (y > 680) newPage();
    const miles     = Number(load.finalMilesSnapshot || (load as any).finalMiles || 0);
    const rate      = Number((load as any).ratePerMileSnapshot || 0);
    const linehaul  = miles * rate;
    totalMiles     += miles;
    totalLinehaul  += linehaul;

    if (idx % 2 === 1) R(50, y, CW, 16, C.altRow);

    const pickup   = extractCity((load as any).verifiedPickupAddress  || load.pickupAddress);
    const delivery = extractCity((load as any).verifiedDeliveryAddress || load.deliveryAddress);

    const cell = (s: string, x: number, w: number, a: "left"|"right" = "left") =>
      T(s, x+4, y+4, fontR, 8, C.dark, w, a);
    cell(load.pickupDate || "N/A",                      colX.date,     colW.date);
    cell(pickup,                                         colX.pickup,   colW.pickup);
    cell(delivery,                                       colX.delivery, colW.delivery);
    cell(fmtMiles(miles),                                colX.miles,    colW.miles,   "right");
    cell(rate > 0 ? `$${rate.toFixed(4)}` : "-",        colX.rate,     colW.rate,    "right");
    cell(fmt$(linehaul),                                 colX.amount,   colW.amount,  "right");
    y += 16;
  });

  if (loads.length === 0) { T("No loads for this period.", 54, y+4, fontR, 8, C.dark); y += 16; }

  L(50, y, 50+CW, C.line); y += 4;
  T(`Total: ${fmtMiles(totalMiles)} mi`, colX.miles-30, y, fontB, 9, C.dark, colW.miles+34, "right");
  T(fmt$(totalLinehaul), colX.amount+4, y, fontB, 9, C.dark, colW.amount, "right");
  y += 24;

  // ── Pay-item sections ────────────────────────────────────────────────────
  const earnings      = payItems.filter(pi => pi.type === "EARNING");
  const deductions    = payItems.filter(pi => pi.type === "DEDUCTION");
  const reimbursements = payItems.filter(pi => pi.type === "REIMBURSEMENT");

  function drawSection(title: string, items: PayItem[]) {
    if (y > 680) newPage();
    L(50, y, 50+CW, C.line); y += 8;
    T(title, 50, y, fontB, 11, C.dark); y += 18;

    if (items.length === 0) { T("None", 54, y, fontR, 8, C.gray); y += 16; return; }

    R(50, y, CW, 18, C.hdrRow);
    T("CATEGORY",    54,             y+5, fontB, 8, C.dark, 120);
    T("DESCRIPTION", 180,            y+5, fontB, 8, C.dark, 260);
    T("AMOUNT",      colX.amount+4, y+5, fontB, 8, C.dark, colW.amount, "right");
    y += 18;

    items.forEach((item, idx) => {
      if (y > 700) newPage();
      if (idx % 2 === 1) R(50, y, CW, 16, C.altRow);
      const cat = ((item as any).category || "OTHER").replace(/_/g, " ");
      const prefix = item.type === "DEDUCTION" ? "-" : "+";
      T(cat,                                          54,            y+4, fontR, 8, C.dark, 120);
      T(item.description || "-",                     180,            y+4, fontR, 8, C.dark, 260);
      T(`${prefix}${fmt$(item.amount)}`, colX.amount+4, y+4, fontR, 8, C.dark, colW.amount, "right");
      y += 16;
    });

    const sub = items.reduce((s, i) => s + Number(i.amount || 0), 0);
    L(50, y, 50+CW, C.line); y += 4;
    const prefix = title.includes("Deduction") ? "-" : "+";
    T(`Subtotal: ${prefix}${fmt$(sub)}`, colX.amount-60, y, fontB, 9, C.dark, colW.amount+64, "right");
    y += 20;
  }

  drawSection("ADDITIONAL EARNINGS", earnings);
  drawSection("DEDUCTIONS",          deductions);
  drawSection("REIMBURSEMENTS",      reimbursements);

  // ── Summary ──────────────────────────────────────────────────────────────
  if (y > 620) newPage();
  y += 10;
  L(50, y, 50+CW, C.headerBg, 1.5); y += 12;

  const sX = 320;  // label x
  const vX = 460;  // value x
  const vW = 102;  // value width

  const summaryRows = [
    { label: "Total Miles",          value: `${fmtMiles(pw.milesTotalSnapshot)} mi` },
    { label: "Base Pay (Linehaul)",  value: fmt$(pw.basePayTotal) },
    { label: "Additional Earnings",  value: `+${fmt$(pw.earningsTotal)}` },
    { label: "Deductions",           value: `-${fmt$(pw.deductionsTotal)}` },
    { label: "Reimbursements",       value: `+${fmt$(pw.reimbursementsTotal)}` },
  ];
  summaryRows.forEach(row => {
    T(row.label, sX, y, fontR, 10, C.dark, 130);
    T(row.value, vX, y, fontR, 10, C.dark, vW, "right");
    y += 16;
  });

  y += 4;
  L(sX, y, vX+vW, C.headerBg, 1); y += 8;
  T("NET PAY",         sX, y, fontB, 14, C.headerBg, 130);
  T(fmt$(pw.netPayTotal), vX, y, fontB, 14, C.headerBg, vW, "right");

  // ── Footer on every page ─────────────────────────────────────────────────
  const pageCount = doc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const p = doc.getPage(i);
    txt(p, "This statement is for settlement purposes only. Taxes/withholdings are not calculated in this app.",
        ML, 740, fontR, 7, C.gray, CW, "center");
    txt(p, `Page ${i + 1} of ${pageCount}`,
        ML, 752, fontR, 7, C.gray, CW, "center");
  }

  return doc.save();
}
