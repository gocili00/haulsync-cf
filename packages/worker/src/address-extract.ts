const US_STATES: Record<string, string> = {
  AL: "AL", ALABAMA: "AL", AK: "AK", ALASKA: "AK", AZ: "AZ", ARIZONA: "AZ",
  AR: "AR", ARKANSAS: "AR", CA: "CA", CALIFORNIA: "CA", CO: "CO", COLORADO: "CO",
  CT: "CT", CONNECTICUT: "CT", DE: "DE", DELAWARE: "DE", FL: "FL", FLORIDA: "FL",
  GA: "GA", GEORGIA: "GA", HI: "HI", HAWAII: "HI", ID: "ID", IDAHO: "ID",
  IL: "IL", ILLINOIS: "IL", IN: "IN", INDIANA: "IN", IA: "IA", IOWA: "IA",
  KS: "KS", KANSAS: "KS", KY: "KY", KENTUCKY: "KY", LA: "LA", LOUISIANA: "LA",
  ME: "ME", MAINE: "ME", MD: "MD", MARYLAND: "MD", MA: "MA", MASSACHUSETTS: "MA",
  MI: "MI", MICHIGAN: "MI", MN: "MN", MINNESOTA: "MN", MS: "MS", MISSISSIPPI: "MS",
  MO: "MO", MISSOURI: "MO", MT: "MT", MONTANA: "MT", NE: "NE", NEBRASKA: "NE",
  NV: "NV", NEVADA: "NV", NH: "NH", NJ: "NJ", NM: "NM", NY: "NY",
  NC: "NC", ND: "ND", OH: "OH", OHIO: "OH", OK: "OK", OKLAHOMA: "OK",
  OR: "OR", OREGON: "OR", PA: "PA", PENNSYLVANIA: "PA", RI: "RI",
  SC: "SC", SD: "SD", TN: "TN", TENNESSEE: "TN", TX: "TX", TEXAS: "TX",
  UT: "UT", UTAH: "UT", VT: "VT", VA: "VA", VIRGINIA: "VA",
  WA: "WA", WASHINGTON: "WA", WV: "WV", WI: "WI", WISCONSIN: "WI",
  WY: "WY", WYOMING: "WY", DC: "DC",
  "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD", "WEST VIRGINIA": "WV",
};

const STATE_ABBR_SET = new Set(Object.values(US_STATES));

const NOISE_KEYWORDS = [
  "PHONE", "CONTACT", "REFERENCE", "DATE", "BILL TO", "FAX",
  "INSTRUCTIONS", "SIGNATURE", "WEIGHT", "PIECES", "COMMODITY",
  "TRAILER", "SEAL", "PO#", "P.O.", "REF#", "BOL#", "PRO#",
  "SPECIAL", "HAZMAT", "TOTAL", "QTY", "DESCRIPTION",
];

const STREET_TOKENS = /\b(ST|STREET|RD|ROAD|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|LN|LANE|HWY|HIGHWAY|ROUTE|RT|WAY|CT|COURT|PL|PLACE|PKWY|PARKWAY|CIR|CIRCLE|I-|US-)\b/i;

const CITY_STATE_ZIP_RE = /([A-Za-z][A-Za-z .'\-]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?/;

const SHIPPER_HEADERS = ["SHIPPER", "SHIP FROM", "ORIGIN", "PICKUP", "FROM:", "P/U", "PICK UP", "SHIP FR"];
const CONSIGNEE_HEADERS = ["CONSIGNEE", "SHIP TO", "DELIVER TO", "DESTINATION", "DELIVERY", "TO:", "DROPOFF", "DROP OFF", "D/O", "RECEIVER"];

export interface AddressCandidate {
  address: string;
  confidence: number;
  sourceLines: string[];
  method: "strict_pair" | "single_line" | "fallback";
}

export interface SectionExtraction {
  primary: AddressCandidate | null;
  candidates: AddressCandidate[];
  allSourceLines: string[];
}

export interface ExtractedAddresses {
  pickupAddress: string | null;
  deliveryAddress: string | null;
  confidencePickup: number;
  confidenceDelivery: number;
  pickupContext: string | null;
  deliveryContext: string | null;
  pickupCandidates: string[];
  deliveryCandidates: string[];
  pickupSourceLines: string[];
  deliverySourceLines: string[];
}

function isNoiseLine(line: string): boolean {
  const upper = line.toUpperCase().trim();
  if (upper.length < 2) return true;
  return NOISE_KEYWORDS.some(kw => upper.includes(kw));
}

function isStreetLike(line: string): boolean {
  const trimmed = line.trim();
  if (/^\d+\s/.test(trimmed)) return true;
  if (STREET_TOKENS.test(trimmed)) return true;
  return false;
}

function isCityStateZip(line: string): { city: string; state: string; zip: string; full: string } | null {
  const match = line.trim().match(CITY_STATE_ZIP_RE);
  if (match && STATE_ABBR_SET.has(match[2])) {
    const city = match[1].trim().replace(/,\s*$/, "");
    return { city, state: match[2], zip: match[3], full: match[0] };
  }
  return null;
}

function isSectionHeader(line: string): boolean {
  const upper = line.toUpperCase().trim();
  return [...SHIPPER_HEADERS, ...CONSIGNEE_HEADERS].some(h => upper.includes(h));
}

function normalizeAddress(addr: string): string {
  return addr.replace(/\s+/g, " ").replace(/,\s*,/g, ",").trim().toUpperCase();
}

function extractFromSection(sectionLines: string[]): SectionExtraction {
  const result: SectionExtraction = {
    primary: null,
    candidates: [],
    allSourceLines: [...sectionLines],
  };

  const cleanLines = sectionLines
    .map(l => l.trim())
    .filter(l => l.length > 1 && !isNoiseLine(l) && !isSectionHeader(l));

  if (cleanLines.length === 0) return result;

  const pairs: AddressCandidate[] = [];

  for (let i = 0; i < cleanLines.length; i++) {
    if (!isStreetLike(cleanLines[i])) continue;

    for (let j = i + 1; j < Math.min(i + 3, cleanLines.length); j++) {
      const csz = isCityStateZip(cleanLines[j]);
      if (csz) {
        const streetLine = cleanLines[i];
        const cszLine = cleanLines[j];
        const address = `${streetLine}, ${csz.city}, ${csz.state} ${csz.zip}`;
        let confidence = 0.85;
        if (csz.zip) confidence += 0.05;
        if (csz.state) confidence += 0.03;
        if (j === i + 1) confidence += 0.05;
        confidence = Math.min(confidence, 0.95);

        pairs.push({
          address,
          confidence,
          sourceLines: [streetLine, cszLine],
          method: "strict_pair",
        });
        break;
      }
    }
  }

  for (const line of cleanLines) {
    const trimmed = line.trim();
    if (/^\d+\s/.test(trimmed)) {
      const csz = isCityStateZip(trimmed);
      if (csz) {
        const address = trimmed.replace(/\s+/g, " ");
        pairs.push({
          address,
          confidence: 0.80,
          sourceLines: [trimmed],
          method: "single_line",
        });
      }
    }
  }

  const seen = new Set<string>();
  const uniqueCandidates: AddressCandidate[] = [];
  for (const c of pairs) {
    const key = normalizeAddress(c.address);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCandidates.push(c);
    }
  }

  result.candidates = uniqueCandidates;
  if (uniqueCandidates.length > 0) {
    result.primary = uniqueCandidates[0];
  } else {
    for (const line of cleanLines) {
      const csz = isCityStateZip(line);
      if (csz) {
        const address = `${csz.city}, ${csz.state} ${csz.zip}`;
        result.primary = {
          address,
          confidence: 0.65,
          sourceLines: [line],
          method: "fallback",
        };
        result.candidates.push(result.primary);
        break;
      }
    }
  }

  return result;
}

function findSectionBoundary(lines: string[], headers: string[], startAfter: number = 0): number {
  for (let i = startAfter; i < lines.length; i++) {
    const upper = lines[i].toUpperCase().trim();
    for (const h of headers) {
      if (h === "FROM:" || h === "TO:") {
        if (upper === h.replace(":", "").trim() || upper.startsWith(h.toUpperCase())) {
          return i;
        }
      } else if (upper.includes(h)) {
        return i;
      }
    }
  }
  return -1;
}

export function extractAddresses(text: string): ExtractedAddresses {
  const result: ExtractedAddresses = {
    pickupAddress: null,
    deliveryAddress: null,
    confidencePickup: 0,
    confidenceDelivery: 0,
    pickupContext: null,
    deliveryContext: null,
    pickupCandidates: [],
    deliveryCandidates: [],
    pickupSourceLines: [],
    deliverySourceLines: [],
  };

  if (!text || text.trim().length < 10) return result;

  const lines = text.split(/\n/).map(l => l.trim());

  const shipperIdx = findSectionBoundary(lines, SHIPPER_HEADERS);
  const consigneeIdx = findSectionBoundary(lines, CONSIGNEE_HEADERS, shipperIdx >= 0 ? shipperIdx + 1 : 0);

  if (shipperIdx >= 0 && consigneeIdx >= 0 && consigneeIdx > shipperIdx) {
    const shipperEnd = consigneeIdx;
    const shipperSection = lines.slice(shipperIdx + 1, shipperEnd);

    const nextHeaderAfterConsignee = findNextMajorHeader(lines, consigneeIdx + 1);
    const consigneeEnd = nextHeaderAfterConsignee >= 0
      ? Math.min(nextHeaderAfterConsignee, consigneeIdx + 15)
      : consigneeIdx + 15;
    const consigneeSection = lines.slice(consigneeIdx + 1, Math.min(consigneeEnd, lines.length));

    const pickupExtraction = extractFromSection(shipperSection);
    const deliveryExtraction = extractFromSection(consigneeSection);

    if (pickupExtraction.primary) {
      result.pickupAddress = pickupExtraction.primary.address;
      result.confidencePickup = Math.round(pickupExtraction.primary.confidence * 100);
      result.pickupSourceLines = pickupExtraction.primary.sourceLines;
    }
    result.pickupCandidates = pickupExtraction.candidates.map(c => c.address);
    result.pickupContext = shipperSection.filter(l => l.length > 0).join("\n");

    if (deliveryExtraction.primary) {
      result.deliveryAddress = deliveryExtraction.primary.address;
      result.confidenceDelivery = Math.round(deliveryExtraction.primary.confidence * 100);
      result.deliverySourceLines = deliveryExtraction.primary.sourceLines;
    }
    result.deliveryCandidates = deliveryExtraction.candidates.map(c => c.address);
    result.deliveryContext = consigneeSection.filter(l => l.length > 0).join("\n");

    if (result.pickupAddress && result.deliveryAddress &&
        normalizeAddress(result.pickupAddress) === normalizeAddress(result.deliveryAddress)) {
      result.deliveryAddress = null;
      result.confidenceDelivery = 0;
      result.deliveryCandidates = [];
      result.deliverySourceLines = [];
    }

  } else if (shipperIdx >= 0) {
    const shipperSection = lines.slice(shipperIdx + 1, shipperIdx + 15);
    const pickupExtraction = extractFromSection(shipperSection);

    if (pickupExtraction.primary) {
      result.pickupAddress = pickupExtraction.primary.address;
      result.confidencePickup = Math.round(pickupExtraction.primary.confidence * 100);
      result.pickupSourceLines = pickupExtraction.primary.sourceLines;
    }
    result.pickupCandidates = pickupExtraction.candidates.map(c => c.address);
    result.pickupContext = shipperSection.filter(l => l.length > 0).join("\n");

    const remainingLines = lines.slice(shipperIdx + 15);
    const deliveryExtraction = extractFromSection(remainingLines);
    if (deliveryExtraction.primary) {
      result.deliveryAddress = deliveryExtraction.primary.address;
      result.confidenceDelivery = Math.max(
        Math.round(deliveryExtraction.primary.confidence * 100) - 20,
        30
      );
      result.deliverySourceLines = deliveryExtraction.primary.sourceLines;
    }
    result.deliveryCandidates = deliveryExtraction.candidates.map(c => c.address);
    result.deliveryContext = remainingLines.filter(l => l.length > 0).slice(0, 10).join("\n");

  } else {
    const allExtraction = extractFromSection(lines);
    if (allExtraction.candidates.length >= 1) {
      const first = allExtraction.candidates[0];
      result.pickupAddress = first.address;
      result.confidencePickup = Math.round(first.confidence * 100 * 0.5);
      result.pickupSourceLines = first.sourceLines;
      result.pickupCandidates = allExtraction.candidates.map(c => c.address);
    }
    if (allExtraction.candidates.length >= 2) {
      const firstNorm = normalizeAddress(allExtraction.candidates[0].address);
      const distinct = allExtraction.candidates.slice(1).find(
        c => normalizeAddress(c.address) !== firstNorm
      );
      if (distinct) {
        result.deliveryAddress = distinct.address;
        result.confidenceDelivery = Math.round(distinct.confidence * 100 * 0.4);
        result.deliverySourceLines = distinct.sourceLines;
        result.deliveryCandidates = allExtraction.candidates
          .filter(c => normalizeAddress(c.address) !== firstNorm)
          .map(c => c.address);
      }
    }
    result.pickupContext = lines.slice(0, 10).filter(l => l.length > 0).join("\n");
    result.deliveryContext = lines.slice(10, 20).filter(l => l.length > 0).join("\n");
  }

  return result;
}

function findNextMajorHeader(lines: string[], startIdx: number): number {
  const majorHeaders = [
    "SPECIAL INSTRUCTIONS", "BILL TO", "THIRD PARTY", "CARRIER",
    "FREIGHT CHARGES", "TOTAL", "TRAILER", "SEAL",
    ...SHIPPER_HEADERS, ...CONSIGNEE_HEADERS,
  ];

  for (let i = startIdx; i < lines.length; i++) {
    const upper = lines[i].toUpperCase().trim();
    if (majorHeaders.some(h => upper.includes(h))) {
      return i;
    }
  }
  return -1;
}
