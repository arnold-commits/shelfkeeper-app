/**
 * ShelfKeeper — Bank Statement CSV Parser
 * 
 * Parses CSV bank statements from major US banks and auto-detects
 * the format. Supports Chase, Bank of America, Wells Fargo, 
 * Capital One, Citi, and generic CSV formats.
 */

// Known bank CSV column patterns
const BANK_PATTERNS: Record<string, { date: string[]; description: string[]; amount: string[]; balance?: string[]; debit?: string[]; credit?: string[] }> = {
  chase: {
    date: ['posting date', 'transaction date'],
    description: ['description'],
    amount: ['amount'],
    balance: ['balance'],
  },
  bofa: {
    date: ['date'],
    description: ['description', 'payee'],
    amount: ['amount'],
    balance: ['running bal.', 'balance'],
  },
  wells_fargo: {
    date: ['date'],
    description: ['description'],
    amount: ['amount'],
    balance: [],
  },
  capital_one: {
    date: ['transaction date', 'posted date'],
    description: ['description', 'payee'],
    debit: ['debit'],
    credit: ['credit'],
    amount: ['amount'],
    balance: ['balance'],
  },
  generic: {
    date: ['date', 'trans date', 'post date', 'posted', 'transaction date'],
    description: ['description', 'memo', 'payee', 'name', 'details', 'transaction'],
    amount: ['amount', 'total', 'value'],
    balance: ['balance', 'running balance', 'available balance'],
    debit: ['debit', 'withdrawal', 'charge'],
    credit: ['credit', 'deposit', 'payment'],
  },
};

// AI categorization rules (built-in defaults)
const DEFAULT_CATEGORY_RULES: Array<{ pattern: string; category: string; account: string }> = [
  // Shipping
  { pattern: 'usps', category: 'Shipping & Postage', account: '6200' },
  { pattern: 'ups store', category: 'Shipping & Postage', account: '6200' },
  { pattern: 'fedex', category: 'Shipping & Postage', account: '6200' },
  { pattern: 'stamps.com', category: 'Shipping & Postage', account: '6200' },
  { pattern: 'pirate ship', category: 'Shipping & Postage', account: '6200' },
  // Supplies
  { pattern: 'uline', category: 'Packaging & Supplies', account: '6900' },
  { pattern: 'amazon.com', category: 'Packaging & Supplies', account: '6900' },
  { pattern: 'staples', category: 'Office Supplies', account: '6300' },
  { pattern: 'office depot', category: 'Office Supplies', account: '6300' },
  // Software
  { pattern: 'accelerlist', category: 'Software & Subscriptions', account: '6400' },
  { pattern: 'inventory lab', category: 'Software & Subscriptions', account: '6400' },
  { pattern: 'keepa', category: 'Software & Subscriptions', account: '6400' },
  { pattern: 'scoutiq', category: 'Software & Subscriptions', account: '6400' },
  { pattern: 'google storage', category: 'Software & Subscriptions', account: '6400' },
  { pattern: 'dropbox', category: 'Software & Subscriptions', account: '6400' },
  { pattern: 'adobe', category: 'Software & Subscriptions', account: '6400' },
  { pattern: 'quickbooks', category: 'Software & Subscriptions', account: '6400' },
  // Vehicle
  { pattern: 'shell', category: 'Car & Truck Expenses', account: '6700' },
  { pattern: 'chevron', category: 'Car & Truck Expenses', account: '6700' },
  { pattern: 'exxon', category: 'Car & Truck Expenses', account: '6700' },
  { pattern: 'bp ', category: 'Car & Truck Expenses', account: '6700' },
  { pattern: 'gas station', category: 'Car & Truck Expenses', account: '6700' },
  { pattern: 'jiffy lube', category: 'Car & Truck Expenses', account: '6700' },
  // Sourcing (COGS) — thrift stores, book sources, wholesale
  { pattern: 'goodwill', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'thrift', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'salvation army', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'library sale', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'book sale', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'yard sale', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'estate sale', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'half price books', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'savers', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'value village', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'deseret', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'arc thrift', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'st vincent', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'habitat for humanity', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'restore', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'books-a-million', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'thriftbooks', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'betterworldbooks', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'bargain books', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'ollies', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'dollar tree', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'ross stores', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'marshalls', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'tj maxx', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'walmart', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'target', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'costco', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'wholesale', category: 'Cost of Goods Sold', account: '5000' },
  { pattern: 'liquidation', category: 'Cost of Goods Sold', account: '5000' },
  // Amazon deposits
  { pattern: 'amazon payments', category: 'Product Sales — Amazon', account: '4000' },
  { pattern: 'amzn mktp', category: 'Product Sales — Amazon', account: '4000' },
  { pattern: 'amazon services', category: 'Product Sales — Amazon', account: '4000' },
  // Insurance
  { pattern: 'state farm', category: 'Insurance', account: '6500' },
  { pattern: 'geico', category: 'Insurance', account: '6500' },
  { pattern: 'progressive', category: 'Insurance', account: '6500' },
  // Meals
  { pattern: 'mcdonald', category: 'Meals (50%)', account: '6800' },
  { pattern: 'starbucks', category: 'Meals (50%)', account: '6800' },
  { pattern: 'chick-fil-a', category: 'Meals (50%)', account: '6800' },
  { pattern: 'subway', category: 'Meals (50%)', account: '6800' },
  // Education
  { pattern: 'udemy', category: 'Education & Training', account: '7100' },
  { pattern: 'coursera', category: 'Education & Training', account: '7100' },
  { pattern: 'skillshare', category: 'Education & Training', account: '7100' },
];

export interface ParsedBankTransaction {
  date: string;
  description: string;
  amount: number;
  balance: number | null;
  type: 'debit' | 'credit';
  suggestedCategory: string | null;
  suggestedAccount: string | null;
  confidence: number;
  raw: Record<string, string>;
}

export interface BankParseResult {
  transactions: ParsedBankTransaction[];
  bankDetected: string;
  accountType: string;
  rowCount: number;
  dateRange: { start: string; end: string } | null;
  error?: string;
}

export function parseBankStatement(content: string): BankParseResult {
  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    return { transactions: [], bankDetected: 'unknown', accountType: 'checking', rowCount: 0, dateRange: null, error: 'File appears empty' };
  }

  // Detect delimiter
  const headerLine = lines[0];
  const delimiter = headerLine.includes('\t') ? '\t' : ',';

  // Parse headers
  const headers = parseCSVLine(headerLine, delimiter).map(h => h.toLowerCase().trim().replace(/^"|"$/g, ''));

  // Detect bank format
  const bankDetected = detectBank(headers);

  // Find column indices
  const pattern = BANK_PATTERNS[bankDetected] || BANK_PATTERNS.generic;
  const dateCol = findColumn(headers, pattern.date);
  const descCol = findColumn(headers, pattern.description);
  const amountCol = findColumn(headers, pattern.amount);
  const balanceCol = pattern.balance ? findColumn(headers, pattern.balance) : -1;
  const debitCol = pattern.debit ? findColumn(headers, pattern.debit) : -1;
  const creditCol = pattern.credit ? findColumn(headers, pattern.credit) : -1;

  if (dateCol === -1 || descCol === -1) {
    return { transactions: [], bankDetected, accountType: 'checking', rowCount: 0, dateRange: null, error: 'Could not find date or description columns' };
  }

  const transactions: ParsedBankTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line, delimiter).map(f => f.replace(/^"|"$/g, '').trim());

    const dateRaw = fields[dateCol] || '';
    const description = fields[descCol] || '';
    if (!dateRaw || !description) continue;

    // Parse amount
    let amount: number;
    if (debitCol !== -1 && creditCol !== -1) {
      const debit = parseFloat((fields[debitCol] || '0').replace(/[$,]/g, '')) || 0;
      const credit = parseFloat((fields[creditCol] || '0').replace(/[$,]/g, '')) || 0;
      amount = credit > 0 ? credit : -debit;
    } else if (amountCol !== -1) {
      amount = parseFloat((fields[amountCol] || '0').replace(/[$,]/g, '')) || 0;
    } else {
      continue;
    }

    const balance = balanceCol !== -1 ? parseFloat((fields[balanceCol] || '').replace(/[$,]/g, '')) || null : null;
    const date = normalizeDate(dateRaw);

    // Auto-categorize
    const { category, account, confidence } = suggestCategory(description);

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = fields[idx] || ''; });

    transactions.push({
      date,
      description,
      amount,
      balance,
      type: amount >= 0 ? 'credit' : 'debit',
      suggestedCategory: category,
      suggestedAccount: account,
      confidence,
      raw,
    });
  }

  // Sort by date
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  const dateRange = transactions.length > 0
    ? { start: transactions[0].date, end: transactions[transactions.length - 1].date }
    : null;

  return {
    transactions,
    bankDetected,
    accountType: detectAccountType(headers, transactions),
    rowCount: transactions.length,
    dateRange,
  };
}

function detectBank(headers: string[]): string {
  const joined = headers.join(' ').toLowerCase();
  if (joined.includes('posting date') && joined.includes('description')) return 'chase';
  if (joined.includes('payee') && joined.includes('running bal')) return 'bofa';
  if (joined.includes('debit') && joined.includes('credit') && joined.includes('posted date')) return 'capital_one';
  return 'generic';
}

function findColumn(headers: string[], patterns: string[]): number {
  for (const p of patterns) {
    const idx = headers.findIndex(h => h.includes(p.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

function detectAccountType(headers: string[], transactions: ParsedBankTransaction[]): string {
  const joined = headers.join(' ').toLowerCase();
  if (joined.includes('credit card') || joined.includes('card number')) return 'credit_card';
  if (joined.includes('savings')) return 'savings';
  // If most transactions are negative, likely credit card
  const negCount = transactions.filter(t => t.amount < 0).length;
  if (negCount > transactions.length * 0.8) return 'credit_card';
  return 'checking';
}

function suggestCategory(description: string): { category: string | null; account: string | null; confidence: number } {
  const lower = description.toLowerCase();
  for (const rule of DEFAULT_CATEGORY_RULES) {
    if (lower.includes(rule.pattern)) {
      return { category: rule.category, account: rule.account, confidence: 0.85 };
    }
  }
  return { category: null, account: null, confidence: 0 };
}

function normalizeDate(raw: string): string {
  if (!raw) return '';
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdyMatch) {
    let [, m, d, y] = mdyMatch;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.substring(0, 10);
  return raw;
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { current += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === delimiter) { fields.push(current); current = ''; }
      else if (char !== '\r') { current += char; }
    }
  }
  fields.push(current);
  return fields;
}
