/**
 * ARJE Books — Amazon Settlement Report Parser
 * 
 * Parses Amazon Flat File V2 Settlement Reports (TSV format)
 * and categorizes every transaction into income, fees, refunds,
 * reimbursements, or other for automatic P&L generation.
 * 
 * Usage:
 *   import { parseSettlementReport } from './settlement-parser';
 *   const result = parseSettlementReport(fileContent);
 */

// ============================================================
// TRANSACTION CATEGORIZATION RULES
// ============================================================
// These mappings turn Amazon's amount-type + amount-description
// pairs into our simplified category/subcategory system.
// Built from real settlement reports — these are the actual
// values Amazon uses.
// ============================================================

const CATEGORY_RULES: Record<string, Record<string, { category: string; subcategory: string }>> = {
  // ── INCOME (money coming in) ──────────────────────────────
  'ItemPrice': {
    'Principal': { category: 'income', subcategory: 'product_sale' },
    'Shipping': { category: 'income', subcategory: 'shipping_income' },
    'GiftWrap': { category: 'income', subcategory: 'gift_wrap_income' },
    'GiftWrapTax': { category: 'income', subcategory: 'tax_collected' },
    'ShippingTax': { category: 'income', subcategory: 'tax_collected' },
    'Tax': { category: 'income', subcategory: 'tax_collected' },
    'RestockingFee': { category: 'income', subcategory: 'restocking_fee' },
    '_default': { category: 'income', subcategory: 'other_income' },
  },

  // ── PROMOTIONS (usually negative — discounts given) ───────
  'Promotion': {
    'Principal': { category: 'fee', subcategory: 'promotion_discount' },
    'Shipping': { category: 'fee', subcategory: 'promotion_shipping' },
    '_default': { category: 'fee', subcategory: 'promotion_other' },
  },

  // ── ITEM FEES (Amazon's cut) ──────────────────────────────
  'ItemFees': {
    'Commission': { category: 'fee', subcategory: 'referral_fee' },
    'RefundCommission': { category: 'fee', subcategory: 'refund_commission' },
    'FBAPerUnitFulfillmentFee': { category: 'fee', subcategory: 'fba_fulfillment_fee' },
    'FBAPerOrderFulfillmentFee': { category: 'fee', subcategory: 'fba_fulfillment_fee' },
    'FBAWeightBasedFee': { category: 'fee', subcategory: 'fba_weight_fee' },
    'ShippingChargeback': { category: 'fee', subcategory: 'shipping_chargeback' },
    'ShippingHB': { category: 'fee', subcategory: 'shipping_holdback' },
    'GiftwrapChargeback': { category: 'fee', subcategory: 'giftwrap_chargeback' },
    'VariableClosingFee': { category: 'fee', subcategory: 'variable_closing_fee' },
    'FixedClosingFee': { category: 'fee', subcategory: 'fixed_closing_fee' },
    'SalesTaxServiceFee': { category: 'fee', subcategory: 'sales_tax_fee' },
    '_default': { category: 'fee', subcategory: 'other_item_fee' },
  },

  // ── OTHER FEES (account-level charges) ────────────────────
  'OtherFees': {
    'FBACustomerReturnPerUnitFee': { category: 'fee', subcategory: 'fba_return_fee' },
    'FBACustomerReturnPerOrderFee': { category: 'fee', subcategory: 'fba_return_fee' },
    'FBACustomerReturnWeightBasedFee': { category: 'fee', subcategory: 'fba_return_fee' },
    '_default': { category: 'fee', subcategory: 'other_fee' },
  },

  // ── DIRECT PAYMENT (transfers, adjustments) ───────────────
  'DirectPayment': {
    '_default': { category: 'other', subcategory: 'direct_payment' },
  },

  // ── OTHER (catch-all for new Amazon fee types) ────────────
  'Other': {
    '_default': { category: 'other', subcategory: 'other' },
  },

  // ── ITEM WITHHELD TAX (marketplace facilitator tax) ─────
  'ItemWithheldTax': {
    'MarketplaceFacilitatorTax-Principal': { category: 'fee', subcategory: 'marketplace_tax_withheld' },
    'MarketplaceFacilitatorTax-Shipping': { category: 'fee', subcategory: 'marketplace_tax_withheld' },
    'MarketplaceFacilitatorVAT-Principal': { category: 'fee', subcategory: 'marketplace_tax_withheld' },
    'MarketplaceFacilitatorVAT-Shipping': { category: 'fee', subcategory: 'marketplace_tax_withheld' },
    '_default': { category: 'fee', subcategory: 'tax_withheld' },
  },

  // ── OTHER TRANSACTIONS (reserves, shipping labels, etc.) ──
  'other-transaction': {
    'Current Reserve Amount': { category: 'other', subcategory: 'reserve_hold' },
    'Previous Reserve Amount Balance': { category: 'other', subcategory: 'reserve_release' },
    'Subscription Fee': { category: 'fee', subcategory: 'subscription_fee' },
    'Shipping label purchase': { category: 'fee', subcategory: 'shipping_label_purchase' },
    'Shipping label purchase for return': { category: 'fee', subcategory: 'shipping_label_return' },
    'RemovalComplete': { category: 'fee', subcategory: 'fba_removal_fee' },
    'Adjustment': { category: 'reimbursement', subcategory: 'adjustment' },
    'FBA Inventory Reimbursement - Customer Return': { category: 'reimbursement', subcategory: 'fba_inventory_reimbursement' },
    'FBA Inventory Reimbursement - Damaged:Warehouse': { category: 'reimbursement', subcategory: 'fba_inventory_reimbursement' },
    'FBA Inventory Reimbursement - Lost:Warehouse': { category: 'reimbursement', subcategory: 'fba_inventory_reimbursement' },
    'Disposal Complete': { category: 'fee', subcategory: 'fba_disposal_fee' },
    'Manual Processing Fee': { category: 'fee', subcategory: 'manual_processing_fee' },
    '_default': { category: 'other', subcategory: 'other_transaction' },
  },

  // ── FBA INVENTORY REIMBURSEMENTS ──────────────────────────
  'FBA Inventory Reimbursement': {
    'WAREHOUSE_DAMAGE': { category: 'reimbursement', subcategory: 'fba_warehouse_damage' },
    'WAREHOUSE_LOST': { category: 'reimbursement', subcategory: 'fba_warehouse_lost' },
    'CUSTOMER_RETURN': { category: 'reimbursement', subcategory: 'fba_customer_return' },
    '_default': { category: 'reimbursement', subcategory: 'fba_reimbursement' },
  },

  // ── COST OF ADVERTISING ──────────────────────────────────
  'CostOfAdvertising': {
    '_default': { category: 'fee', subcategory: 'advertising_cost' },
  },
  'Cost of Advertising': {
    '_default': { category: 'fee', subcategory: 'advertising_cost' },
  },
};

// Transaction-type level overrides
const TRANSACTION_TYPE_OVERRIDES: Record<string, string> = {
  'Refund': 'refund',
  'ServiceFee': 'fee',
  'Adjustment': 'reimbursement',
  'BalanceAdjustment': 'reimbursement',
  'Transfer': 'other',
  'FBA Inventory Fee': 'fee',
  'Liquidations': 'other',
};

// Known service fee descriptions
const SERVICE_FEE_SUBCATEGORIES: Record<string, string> = {
  'FBAInboundTransportationFee': 'fba_inbound_shipping',
  'FBAInboundTransportationProgramFee': 'fba_inbound_shipping',
  'FBAStorageFee': 'fba_storage_fee',
  'FBALongTermStorageFee': 'fba_long_term_storage',
  'FBARemovalOrderFee': 'fba_removal_fee',
  'FBADisposalFee': 'fba_disposal_fee',
  'Subscription': 'subscription_fee',
  'FBAInboundDefectFee': 'fba_inbound_defect',
};

// ============================================================
// PARSER
// ============================================================

/**
 * Parse an Amazon Settlement Report (V2 Flat File TSV format)
 * 
 * @param {string} content - Raw file content (TSV)
 * @returns {Object} Parsed result with transactions, summary, and metadata
 */
export function parseSettlementReport(content: string) {
  // Remove BOM if present (UTF-8 BOM = \uFEFF after decoding, or raw bytes EF BB BF)
  content = content.replace(/^\uFEFF/, '').replace(/^\xEF\xBB\xBF/, '');

  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    return { error: 'File appears to be empty or has no data rows', transactions: [], summary: null };
  }

  // ── FIND THE ACTUAL HEADER ROW ────────────────────────
  // Amazon transaction reports have metadata lines at the top.
  // The header row is the first line that has recognizable column names.
  let headerLineIndex = 0;
  const headerPatterns = ['date/time', 'settlement-id', 'settlement id', 'amount-type', 'amount', 'product sales', 'transaction type', 'order id', 'total'];

  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const lower = lines[i].toLowerCase().replace(/"/g, '');
    const matchCount = headerPatterns.filter(p => lower.includes(p)).length;
    if (matchCount >= 3) {
      headerLineIndex = i;
      break;
    }
  }

  // Detect delimiter from the header line
  const headerLine = lines[headerLineIndex];
  // Count tabs vs commas (commas inside quotes don't count)
  const tabCount = (headerLine.match(/\t/g) || []).length;
  const delimiter = tabCount > 3 ? '\t' : ',';

  // Parse headers (normalize to lowercase, trim whitespace and quotes)
  const headers = parseCSVLine(headerLine, delimiter).map(h => h.trim().toLowerCase().replace(/^"|"$/g, '').replace(/["\r]/g, ''));

  // Validate required columns
  const requiredColumns = ['amount-type', 'amount-description', 'amount'];
  // Also check V2 alternate names
  const altNames = { 'amount-type': 'amounttype', 'amount-description': 'amountdescription' };

  const columnMap: Record<string, number> = {};
  headers.forEach((h, i) => {
    const normalized = h.replace(/[-_\s]/g, '').toLowerCase();
    columnMap[normalized] = i;
    // Also store with original spaces removed but keep slashes
    const alt = h.replace(/\s+/g, '').toLowerCase();
    if (alt !== normalized) columnMap[alt] = i;
  });

  // Build field index lookup with fallbacks
  function findCol(name: string) {
    const variations = [
      name,
      name.replace(/-/g, ''),
      name.replace(/-/g, '_'),
      name.replace(/-/g, ' '),
    ].map(v => v.replace(/[-_\s]/g, '').toLowerCase());

    for (const v of variations) {
      if (columnMap[v] !== undefined) return columnMap[v];
    }
    return -1;
  }

  const COL = {
    settlementId: findCol('settlement-id') !== -1 ? findCol('settlement-id') : findCol('settlement id'),
    transactionType: findCol('transaction-type') !== -1 ? findCol('transaction-type') : findCol('type'),
    orderId: findCol('order-id') !== -1 ? findCol('order-id') : findCol('order id'),
    merchantOrderId: findCol('merchant-order-id'),
    adjustmentId: findCol('adjustment-id'),
    shipmentId: findCol('shipment-id'),
    marketplaceName: findCol('marketplace-name') !== -1 ? findCol('marketplace-name') : findCol('marketplace'),
    amountType: findCol('amount-type'),
    amountDescription: findCol('amount-description') !== -1 ? findCol('amount-description') : findCol('description'),
    amount: findCol('amount'),
    quantityPurchased: findCol('quantity-purchased') !== -1 ? findCol('quantity-purchased') : findCol('quantity'),
    postedDate: findCol('posted-date') !== -1 ? findCol('posted-date') : findCol('date/time'),
    postedDateTime: findCol('posted-date-time') !== -1 ? findCol('posted-date-time') : findCol('date/time'),
    sku: findCol('sku'),
    asin: findCol('asin') !== -1 ? findCol('asin') : findCol('fnsku'),
    fulfillmentId: findCol('fulfillment-id') !== -1 ? findCol('fulfillment-id') : findCol('fulfillment'),
    orderCity: findCol('order-city') !== -1 ? findCol('order-city') : findCol('order city'),
    orderState: findCol('order-state') !== -1 ? findCol('order-state') : findCol('order state'),
    orderPostal: findCol('order-postal') !== -1 ? findCol('order-postal') : findCol('order postal'),
    depositDate: findCol('deposit-date'),
    settlementStartDate: findCol('settlement-start-date'),
    settlementEndDate: findCol('settlement-end-date'),
    totalAmount: findCol('total-amount') !== -1 ? findCol('total-amount') : findCol('total'),
    // New columns in 2025 reports
    productName: findCol('description'),
    accountType: findCol('account-type') !== -1 ? findCol('account-type') : findCol('account type'),
    transactionStatus: findCol('transaction status'),
    transactionReleaseDate: findCol('transaction release date'),
  };

  // ── DETECT REPORT FORMAT ──────────────────────────────
  // V2 Flat File: has 'amount-type', 'amount-description', 'amount' columns
  // V1 Flat File: has individual columns like 'product-sales', 'shipping-credits', 'fba-fees', etc.
  // Date Range Report: has 'type', 'description', 'total' or similar

  const isV2 = COL.amount !== -1 && COL.amountType !== -1;
  const isV1 = !isV2 && (findCol('product-sales') !== -1 || findCol('product-sales-tax') !== -1 || findCol('total') !== -1);

  // V1 column map — these are the individual price columns in the old format
  const V1_COLS: Record<string, { col: number; category: string; subcategory: string }> = {};
  if (isV1) {
    const v1Mappings: Array<[string, string, string]> = [
      ['product-sales', 'income', 'product_sale'],
      ['product-sales-tax', 'income', 'tax_collected'],
      ['shipping-credits', 'income', 'shipping_income'],
      ['shipping-credits-tax', 'income', 'tax_collected'],
      ['gift-wrap-credits', 'income', 'gift_wrap_income'],
      ['giftwrap-credits-tax', 'income', 'tax_collected'],
      ['gift-wrap-credits-tax', 'income', 'tax_collected'],
      ['giftwrap credits tax', 'income', 'tax_collected'],
      ['regulatory-fee', 'fee', 'regulatory_fee'],
      ['regulatory fee', 'fee', 'regulatory_fee'],
      ['tax-on-regulatory-fee', 'fee', 'regulatory_fee_tax'],
      ['tax on regulatory fee', 'fee', 'regulatory_fee_tax'],
      ['promotional-rebates', 'fee', 'promotion_discount'],
      ['promotional-rebates-tax', 'fee', 'promotion_discount'],
      ['promotional rebates tax', 'fee', 'promotion_discount'],
      ['marketplace-withheld-tax', 'fee', 'sales_tax_fee'],
      ['marketplace withheld tax', 'fee', 'sales_tax_fee'],
      ['selling-fees', 'fee', 'referral_fee'],
      ['selling fees', 'fee', 'referral_fee'],
      ['fba-fees', 'fee', 'fba_fulfillment_fee'],
      ['fba fees', 'fee', 'fba_fulfillment_fee'],
      ['other-transaction-fees', 'fee', 'other_fee'],
      ['other transaction fees', 'fee', 'other_fee'],
      ['other', 'other', 'other'],
      ['total', 'other', 'total'],
    ];
    for (const [colName, cat, subcat] of v1Mappings) {
      const idx = findCol(colName);
      if (idx !== -1) V1_COLS[colName] = { col: idx, category: cat, subcategory: subcat };
    }
  }

  // If neither V1 nor V2 detected, try to find any numeric column
  if (!isV2 && !isV1) {
    // Check for 'total' column (common in date range reports)
    const totalCol = findCol('total');
    if (totalCol !== -1) {
      // Re-assign amount to total
      COL.amount = totalCol;
    } else {
      // Last resort: find first column with numeric data
      return {
        error: 'Could not find "amount" column. This may not be an Amazon settlement report. Supported formats: Flat File V1, Flat File V2, and Date Range Reports. Please download your report from Seller Central → Reports → Payments → All Statements → Download Flat File V2.',
        transactions: [],
        summary: null,
        headers,
      };
    }
  }

  // Parse rows
  const transactions: any[] = [];
  let metadata: any = {};
  let parseErrors: string[] = [];

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line, delimiter);

    const getValue = (colIndex: number) => {
      if (colIndex === -1 || colIndex >= fields.length) return null;
      const val = fields[colIndex]?.replace(/^"|"$/g, '').trim();
      return val || null;
    };

    // Extract common fields
    const transactionType = getValue(COL.transactionType);
    const orderId = getValue(COL.orderId);
    const sku = getValue(COL.sku);
    const asin = getValue(COL.asin);
    const postedDate = getValue(COL.postedDate);
    const postedDateTime = getValue(COL.postedDateTime);
    const quantityPurchased = parseInt(getValue(COL.quantityPurchased) || '') || null;
    const settlementId = getValue(COL.settlementId);

    // Extract metadata from first rows
    if (!metadata.settlementId && settlementId) {
      metadata.settlementId = settlementId;
      const dd = getValue(COL.depositDate);
      const sd = getValue(COL.settlementStartDate);
      const ed = getValue(COL.settlementEndDate);
      const ta = getValue(COL.totalAmount);
      if (dd) metadata.depositDate = dd;
      if (sd) metadata.settlementStartDate = sd;
      if (ed) metadata.settlementEndDate = ed;
      if (ta) metadata.totalAmount = parseAmount(ta);
    }

    if (isV2) {
      // ── V2 FORMAT: single amount column ────────────────
      const amountRaw = getValue(COL.amount);
      if (!amountRaw && amountRaw !== '0') continue;

      const amount = parseAmount(amountRaw);
      if (isNaN(amount)) continue;

      const amountType = getValue(COL.amountType);
      const amountDescription = getValue(COL.amountDescription);

      const { category, subcategory } = categorizeTransaction(
        transactionType, amountType, amountDescription, amount
      );

      transactions.push({
        settlementId: settlementId || metadata.settlementId,
        transactionType, orderId,
        merchantOrderId: getValue(COL.merchantOrderId),
        adjustmentId: getValue(COL.adjustmentId),
        shipmentId: getValue(COL.shipmentId),
        marketplaceName: getValue(COL.marketplaceName),
        amountType, amountDescription, amount, quantityPurchased,
        postedDate: normalizeDate(postedDate),
        postedDateTime: postedDateTime || null,
        sku, asin, category, subcategory,
      });

    } else if (isV1) {
      // ── V1 FORMAT: separate column per fee/income type ──
      // Each row has multiple amount columns — create one transaction per non-zero column
      let hasAnyAmount = false;

      for (const [colName, info] of Object.entries(V1_COLS)) {
        const raw = getValue(info.col);
        if (!raw || raw === '0' || raw === '0.00') continue;
        const amount = parseAmount(raw);
        if (isNaN(amount) || amount === 0) continue;

        hasAnyAmount = true;

        // Skip the 'total' column — it's just a sum of the others
        if (colName === 'total') continue;

        transactions.push({
          settlementId: settlementId || metadata.settlementId,
          transactionType: transactionType || 'Order',
          orderId,
          merchantOrderId: getValue(COL.merchantOrderId),
          adjustmentId: getValue(COL.adjustmentId),
          shipmentId: getValue(COL.shipmentId),
          marketplaceName: getValue(COL.marketplaceName),
          amountType: colName,
          amountDescription: colName,
          amount, quantityPurchased,
          postedDate: normalizeDate(postedDate),
          postedDateTime: postedDateTime || null,
          sku, asin,
          category: info.category,
          subcategory: info.subcategory,
        });
      }

      // If no individual columns had data, try the 'total' column as fallback
      if (!hasAnyAmount && V1_COLS['total']) {
        const totalRaw = getValue(V1_COLS['total'].col);
        if (totalRaw) {
          const amount = parseAmount(totalRaw);
          if (!isNaN(amount) && amount !== 0) {
            const { category, subcategory } = categorizeTransaction(
              transactionType, null, null, amount
            );
            transactions.push({
              settlementId: settlementId || metadata.settlementId,
              transactionType, orderId,
              merchantOrderId: getValue(COL.merchantOrderId),
              adjustmentId: null, shipmentId: null,
              marketplaceName: getValue(COL.marketplaceName),
              amountType: 'total', amountDescription: 'total',
              amount, quantityPurchased,
              postedDate: normalizeDate(postedDate),
              postedDateTime: postedDateTime || null,
              sku, asin, category, subcategory,
            });
          }
        }
      }

    } else {
      // ── FALLBACK: single amount column (date range reports) ──
      const amountRaw = getValue(COL.amount);
      if (!amountRaw) continue;
      const amount = parseAmount(amountRaw);
      if (isNaN(amount)) continue;

      const { category, subcategory } = categorizeTransaction(
        transactionType, getValue(COL.amountType), getValue(COL.amountDescription), amount
      );

      transactions.push({
        settlementId: settlementId || metadata.settlementId,
        transactionType, orderId,
        merchantOrderId: getValue(COL.merchantOrderId),
        adjustmentId: null, shipmentId: null,
        marketplaceName: getValue(COL.marketplaceName),
        amountType: getValue(COL.amountType) || 'unknown',
        amountDescription: getValue(COL.amountDescription) || 'unknown',
        amount, quantityPurchased,
        postedDate: normalizeDate(postedDate),
        postedDateTime: postedDateTime || null,
        sku, asin, category, subcategory,
      });
    }
  }

  // Build summary
  const summary = buildSummary(transactions);

  return {
    transactions,
    summary,
    metadata,
    parseErrors,
    rowCount: transactions.length,
  };
}

// ============================================================
// CATEGORIZATION ENGINE
// ============================================================

function categorizeTransaction(transactionType: any, amountType: any, amountDescription: any, amount: number) {
  // Check transaction-type level overrides first
  if (transactionType && TRANSACTION_TYPE_OVERRIDES[transactionType]) {
    const overrideCategory = TRANSACTION_TYPE_OVERRIDES[transactionType];

    // For refunds, determine subcategory from amount type
    if (overrideCategory === 'refund') {
      if (amountType === 'ItemPrice') {
        return { category: 'refund', subcategory: 'refund_principal' };
      }
      if (amountType === 'ItemFees') {
        return { category: 'refund', subcategory: 'refund_fee_reversal' };
      }
      if (amountType === 'Promotion') {
        return { category: 'refund', subcategory: 'refund_promotion' };
      }
      return { category: 'refund', subcategory: 'refund_other' };
    }

    // For service fees, check specific descriptions
    if (overrideCategory === 'fee' && amountDescription) {
      const sub = SERVICE_FEE_SUBCATEGORIES[amountDescription];
      if (sub) return { category: 'fee', subcategory: sub };
      return { category: 'fee', subcategory: 'service_fee_other' };
    }

    // For adjustments/reimbursements
    if (overrideCategory === 'reimbursement') {
      return { category: 'reimbursement', subcategory: amountDescription || 'adjustment' };
    }

    return { category: overrideCategory, subcategory: amountDescription || 'unknown' };
  }

  // Check amount-type rules
  if (amountType && CATEGORY_RULES[amountType]) {
    const typeRules = CATEGORY_RULES[amountType];
    if (amountDescription && typeRules[amountDescription]) {
      return typeRules[amountDescription];
    }
    return typeRules['_default'] || { category: 'other', subcategory: 'unknown' };
  }

  // Fallback: use amount sign as a hint
  if (amount > 0) return { category: 'income', subcategory: 'uncategorized_income' };
  if (amount < 0) return { category: 'fee', subcategory: 'uncategorized_fee' };
  return { category: 'other', subcategory: 'zero_amount' };
}

// ============================================================
// SUMMARY BUILDER
// ============================================================

function buildSummary(transactions: any[]) {
  const summary: any = {
    // Totals
    grossIncome: 0,
    totalFees: 0,
    totalRefunds: 0,
    totalReimbursements: 0,
    totalOther: 0,
    netProfit: 0,

    // Counts
    totalTransactions: transactions.length,
    orderCount: 0,
    refundCount: 0,
    uniqueSkus: new Set(),
    uniqueOrders: new Set(),

    // Fee breakdown
    feeBreakdown: {} as Record<string, number>,

    // Income breakdown
    incomeBreakdown: {} as Record<string, number>,

    // Top products by revenue
    skuRevenue: {} as Record<string, any>,

    // Daily totals for charting
    dailyTotals: {} as Record<string, any>,
  };

  for (const tx of transactions) {
    // Accumulate by category
    switch (tx.category) {
      case 'income':
        summary.grossIncome += tx.amount;
        summary.incomeBreakdown[tx.subcategory] = (summary.incomeBreakdown[tx.subcategory] || 0) + tx.amount;
        break;
      case 'fee':
        summary.totalFees += tx.amount;
        summary.feeBreakdown[tx.subcategory] = (summary.feeBreakdown[tx.subcategory] || 0) + tx.amount;
        break;
      case 'refund':
        summary.totalRefunds += tx.amount;
        break;
      case 'reimbursement':
        summary.totalReimbursements += tx.amount;
        break;
      default:
        summary.totalOther += tx.amount;
    }

    // Track orders and SKUs
    if (tx.orderId) summary.uniqueOrders.add(tx.orderId);
    if (tx.sku) summary.uniqueSkus.add(tx.sku);
    if (tx.transactionType === 'Order') summary.orderCount++;
    if (tx.transactionType === 'Refund') summary.refundCount++;

    // SKU revenue tracking
    if (tx.sku && tx.category === 'income') {
      if (!summary.skuRevenue[tx.sku]) {
        summary.skuRevenue[tx.sku] = { sku: tx.sku, asin: tx.asin, revenue: 0, fees: 0, net: 0, units: 0 };
      }
      summary.skuRevenue[tx.sku].revenue += tx.amount;
      if (tx.quantityPurchased) summary.skuRevenue[tx.sku].units += tx.quantityPurchased;
    }
    if (tx.sku && tx.category === 'fee') {
      if (!summary.skuRevenue[tx.sku]) {
        summary.skuRevenue[tx.sku] = { sku: tx.sku, asin: tx.asin, revenue: 0, fees: 0, net: 0, units: 0 };
      }
      summary.skuRevenue[tx.sku].fees += tx.amount;
    }

    // Daily totals
    if (tx.postedDate) {
      if (!summary.dailyTotals[tx.postedDate]) {
        summary.dailyTotals[tx.postedDate] = { income: 0, fees: 0, refunds: 0, net: 0 };
      }
      const day = summary.dailyTotals[tx.postedDate];
      if (tx.category === 'income') day.income += tx.amount;
      if (tx.category === 'fee') day.fees += tx.amount;
      if (tx.category === 'refund') day.refunds += tx.amount;
      day.net += tx.amount;
    }
  }

  // Compute net
  summary.netProfit = summary.grossIncome + summary.totalFees + summary.totalRefunds +
    summary.totalReimbursements + summary.totalOther;

  // Compute per-SKU net
  Object.values(summary.skuRevenue).forEach((s: any) => {
    s.net = s.revenue + s.fees;
  });

  // Convert sets to counts
  summary.uniqueSkuCount = summary.uniqueSkus.size;
  summary.uniqueOrderCount = summary.uniqueOrders.size;
  delete summary.uniqueSkus;
  delete summary.uniqueOrders;

  // Sort SKU revenue by net descending
  summary.topProducts = Object.values(summary.skuRevenue)
    .sort((a: any, b: any) => b.net - a.net)
    .slice(0, 50);

  // Sort daily totals chronologically
  summary.dailyChart = Object.entries(summary.dailyTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]: [string, any]) => ({
      date,
      income: round2(vals.income),
      fees: round2(vals.fees),
      refunds: round2(vals.refunds),
      net: round2(vals.net),
    }));

  // Round all money values
  summary.grossIncome = round2(summary.grossIncome);
  summary.totalFees = round2(summary.totalFees);
  summary.totalRefunds = round2(summary.totalRefunds);
  summary.totalReimbursements = round2(summary.totalReimbursements);
  summary.totalOther = round2(summary.totalOther);
  summary.netProfit = round2(summary.netProfit);

  // Round breakdowns
  for (const key of Object.keys(summary.feeBreakdown)) {
    summary.feeBreakdown[key] = round2(summary.feeBreakdown[key]);
  }
  for (const key of Object.keys(summary.incomeBreakdown)) {
    summary.incomeBreakdown[key] = round2(summary.incomeBreakdown[key]);
  }

  return summary;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function parseAmount(raw: any) {
  if (!raw) return NaN;
  // Remove currency symbols and whitespace
  let cleaned = raw.replace(/[$€£¥\s]/g, '');
  // Handle EU format: 1.234,56 → 1234.56
  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      // EU format: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 1,234.56
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // Could be EU decimal or US thousands
    const parts = cleaned.split(',');
    if (parts[parts.length - 1].length === 2) {
      // Likely EU decimal: 95,00
      cleaned = cleaned.replace(',', '.');
    } else {
      // Likely US thousands: 1,234
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  return parseFloat(cleaned);
}

function normalizeDate(raw: any) {
  if (!raw) return null;
  // Remove quotes
  raw = raw.replace(/^"|"$/g, '').trim();

  // Amazon verbose format: "Jan 1, 2025 10:17:52 AM PST"
  const MONTHS: Record<string, string> = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
  const verboseMatch = raw.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/);
  if (verboseMatch) {
    const [, mon, d, y] = verboseMatch;
    const m = MONTHS[mon.toLowerCase()];
    if (m) return `${y}-${m}-${d.padStart(2, '0')}`;
  }

  // MM/DD/YY or MM/DD/YYYY
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdyMatch) {
    let [, m, d, y] = mdyMatch;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // YYYY-MM-DD (already correct)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.substring(0, 10);
  }
  // DD.MM.YYYY (EU)
  const euMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (euMatch) {
    const [, d, m, y] = euMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return raw;
}

function parseCSVLine(line: string, delimiter: string) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        fields.push(current);
        current = '';
      } else if (char !== '\r') {
        current += char;
      }
    }
  }
  fields.push(current);
  return fields;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ============================================================
// EXPORT FOR TESTING (Node.js compatible)
// ============================================================
export { categorizeTransaction, parseAmount, normalizeDate, buildSummary };
