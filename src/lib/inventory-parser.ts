// Amazon Inventory Report Parser
// Handles: Inventory Event Detail, Manage Inventory, FBA Inventory (various formats)

export function parseInventoryReport(text: string) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return { error: "File appears empty", items: [], summary: null };

  // Detect format by header
  const headerLine = lines[0].toLowerCase().replace(/"/g, "");
  
  // Format 1: Inventory Event Detail (Date, FNSKU, ASIN, MSKU, Title, Event Type, ...)
  if (headerLine.includes("event type") && headerLine.includes("fnsku")) {
    return parseEventDetail(lines);
  }
  
  // Format 2: Manage FBA Inventory / Active Listings (sku, asin, price, quantity, ...)
  if (headerLine.includes("seller-sku") || headerLine.includes("sku") && headerLine.includes("quantity")) {
    return parseManageInventory(lines);
  }

  // Format 3: Inventory Ledger Summary (Date, FNSKU, ASIN, Starting Balance, Ending Balance, ...)
  if (headerLine.includes("starting warehouse balance") || headerLine.includes("ending warehouse balance")) {
    return parseLedgerSummary(lines);
  }

  return { error: "Unrecognized inventory report format. Supported: Inventory Event Detail, Manage FBA Inventory, Inventory Ledger Summary.", items: [], summary: null };
}

function parseEventDetail(lines: string[]) {
  const headers = parseCSVLine(lines[0]);
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => { colMap[h.toLowerCase().replace(/"/g, "").trim()] = i; });

  // Get the last date's ending snapshot
  const items: Record<string, { sku: string; fnsku: string; asin: string; title: string; quantity: number; disposition: string; fc: string }> = {};
  let latestDate = "";

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCSVLine(lines[i]);
    const date = cols[colMap["date"]]?.replace(/"/g, "").trim() || "";
    const sku = cols[colMap["msku"]]?.replace(/"/g, "").trim() || "";
    const fnsku = cols[colMap["fnsku"]]?.replace(/"/g, "").trim() || "";
    const asin = cols[colMap["asin"]]?.replace(/"/g, "").trim() || "";
    const title = cols[colMap["title"]]?.replace(/"/g, "").trim() || "";
    const qty = parseInt(cols[colMap["quantity"]]?.replace(/"/g, "").trim() || "0") || 0;
    const disposition = cols[colMap["disposition"]]?.replace(/"/g, "").trim() || "SELLABLE";
    const fc = cols[colMap["fulfillment center"]]?.replace(/"/g, "").trim() || "";
    const eventType = cols[colMap["event type"]]?.replace(/"/g, "").trim() || "";

    if (date > latestDate) latestDate = date;

    // Build running total per SKU
    const key = `${sku}|${disposition}`;
    if (!items[key]) {
      items[key] = { sku, fnsku, asin, title, quantity: 0, disposition, fc };
    }
    // For event detail, quantity is the change (+/-)
    items[key].quantity += qty;
  }

  // Convert date format (MM/DD/YYYY or YYYY-MM-DD)
  let snapshotDate = latestDate;
  if (latestDate.includes("/")) {
    const [m, d, y] = latestDate.split("/");
    snapshotDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const result = Object.values(items).filter(i => i.quantity > 0);
  const totalSellable = result.filter(i => i.disposition === "SELLABLE").reduce((s, i) => s + i.quantity, 0);
  const totalUnsellable = result.filter(i => i.disposition !== "SELLABLE").reduce((s, i) => s + i.quantity, 0);

  return {
    error: null,
    format: "event_detail",
    snapshotDate,
    items: result,
    summary: {
      uniqueSkus: new Set(result.map(i => i.sku)).size,
      totalSellable,
      totalUnsellable,
      totalUnits: totalSellable + totalUnsellable,
    }
  };
}

function parseManageInventory(lines: string[]) {
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map(h => h.toLowerCase().replace(/"/g, "").trim());
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  const items: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = lines[i].split(sep).map(c => c.replace(/"/g, "").trim());
    
    const sku = cols[colMap["seller-sku"] ?? colMap["sku"]] || "";
    const asin = cols[colMap["asin1"] ?? colMap["asin"]] || "";
    const title = cols[colMap["item-name"] ?? colMap["product-name"] ?? colMap["title"]] || "";
    const qty = parseInt(cols[colMap["quantity"] ?? colMap["afn-fulfillable-quantity"]] || "0") || 0;
    const fnsku = cols[colMap["fnsku"]] || "";

    if (sku && qty > 0) {
      items.push({ sku, fnsku, asin, title, quantity: qty, disposition: "SELLABLE", fc: "" });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  return {
    error: null,
    format: "manage_inventory",
    snapshotDate: today,
    items,
    summary: {
      uniqueSkus: items.length,
      totalSellable: items.reduce((s, i) => s + i.quantity, 0),
      totalUnsellable: 0,
      totalUnits: items.reduce((s, i) => s + i.quantity, 0),
    }
  };
}

function parseLedgerSummary(lines: string[]) {
  const headers = parseCSVLine(lines[0]);
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => { colMap[h.toLowerCase().replace(/"/g, "").trim()] = i; });

  const items: any[] = [];
  let latestDate = "";

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCSVLine(lines[i]);
    const date = cols[colMap["date"]]?.replace(/"/g, "").trim() || "";
    const sku = cols[colMap["msku"]]?.replace(/"/g, "").trim() || "";
    const fnsku = cols[colMap["fnsku"]]?.replace(/"/g, "").trim() || "";
    const asin = cols[colMap["asin"]]?.replace(/"/g, "").trim() || "";
    const title = cols[colMap["title"]]?.replace(/"/g, "").trim() || "";
    const endBal = parseInt(cols[colMap["ending warehouse balance"]]?.replace(/"/g, "").trim() || "0") || 0;
    const disposition = cols[colMap["disposition"]]?.replace(/"/g, "").trim() || "SELLABLE";

    if (date > latestDate) latestDate = date;
    if (sku && endBal > 0) {
      items.push({ sku, fnsku, asin, title, quantity: endBal, disposition, fc: "" });
    }
  }

  let snapshotDate = latestDate;
  if (latestDate.includes("/")) {
    const [m, d, y] = latestDate.split("/");
    snapshotDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Dedupe by SKU+disposition (take latest)
  const deduped: Record<string, any> = {};
  items.forEach(item => {
    const key = `${item.sku}|${item.disposition}`;
    deduped[key] = item; // last entry wins
  });
  const result = Object.values(deduped);

  const totalSellable = result.filter(i => i.disposition === "SELLABLE").reduce((s, i) => s + i.quantity, 0);
  const totalUnsellable = result.filter(i => i.disposition !== "SELLABLE").reduce((s, i) => s + i.quantity, 0);

  return {
    error: null,
    format: "ledger_summary",
    snapshotDate,
    items: result,
    summary: {
      uniqueSkus: new Set(result.map(i => i.sku)).size,
      totalSellable,
      totalUnsellable,
      totalUnits: totalSellable + totalUnsellable,
    }
  };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if ((ch === "," || ch === "\t") && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}
