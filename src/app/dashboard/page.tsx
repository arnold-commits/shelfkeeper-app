"use client";
import { useState, useCallback, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { parseSettlementReport } from "@/lib/settlement-parser";
import { parseInventoryReport } from "@/lib/inventory-parser";

type ParseResult = {
  error?: string;
  transactions: any[];
  summary: any;
  metadata: any;
  parseErrors?: any[];
  rowCount: number;
};
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Upload, FileText, TrendingUp, DollarSign, AlertTriangle, Package, MessageSquare, Plus, Download, LogOut, ChevronDown, BarChart3, Landmark, CheckCircle, XCircle, Split, Eye } from "lucide-react";
import Link from "next/link";
import { parseBankStatement } from "@/lib/bank-parser";

// ── FORMATTING HELPERS ─────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";

// ── EXPENSE CATEGORIES ─────────────────────────────────
const EXPENSE_CATS = [
  "Advertising", "Car & Truck Expenses", "Commissions & Fees", "Contract Labor",
  "Cost of Goods Sold", "Education & Training", "Insurance", "Legal & Professional",
  "Office Expense", "Packaging & Supplies", "Rent/Lease (Other)",
  "Shipping & Postage", "Software & Subscriptions", "Supplies", "Taxes & Licenses",
  "Travel", "Meals (50%)", "Utilities", "Home Office", "Other Expenses",
];

// ── METRIC CARD ────────────────────────────────────────
function MetricCard({ label, value, sub, color = "text-white" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
      <div className="text-xs text-gray-500 font-medium tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

// ── MAIN DASHBOARD ─────────────────────────────────────
export default function Dashboard() {
  const [tab, setTab] = useState("dashboard");
  const [user, setUser] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  // AI Chat
  const [aiMessages, setAiMessages] = useState([
    { role: "assistant", content: "Hi! I'm your ShelfKeeper AI. Ask me anything about your Amazon finances — profits, fees, products, tax prep, and more." },
  ]);
  const [aiInput, setAiInput] = useState("");

  // New expense form
  const [newExp, setNewExp] = useState({ date: new Date().toISOString().slice(0, 10), category: EXPENSE_CATS[0], amount: "", vendor: "", description: "" });

  // Balance sheet
  const [balanceSheet, setBalanceSheet] = useState<any>(null);

  // Bank transactions
  const [bankTxns, setBankTxns] = useState<any[]>([]);
  const [bankFilter, setBankFilter] = useState<"all" | "unreviewed" | "business" | "personal">("all");
  const [bankUploading, setBankUploading] = useState(false);
  const [bankMsg, setBankMsg] = useState("");

  // Reconciliation
  const [reconData, setReconData] = useState<any>(null);

  // P&L Statement
  const [pnlData, setPnlData] = useState<any>(null);

  // 1099-K Reconciliation
  const [k1099Recon, setK1099Recon] = useState<any[]>([]);

  // Chart of Accounts
  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);
  const [coaEditId, setCoaEditId] = useState<string | null>(null);
  const [coaForm, setCoaForm] = useState({ account_number: "", account_name: "", account_type: "asset", description: "", beginning_balance: "0" });

  // Journal Entries
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [showJEForm, setShowJEForm] = useState(false);
  const [jeForm, setJeForm] = useState({ date: new Date().toISOString().slice(0, 10), memo: "", is_opening_balance: false, lines: [{ account_id: "", debit: "", credit: "", memo: "" }, { account_id: "", debit: "", credit: "", memo: "" }] });

  // Trial Balance
  const [trialBalance, setTrialBalance] = useState<any[]>([]);

  // Date Range Filter
  const [dateFrom, setDateFrom] = useState("2025-01-01");
  const [dateTo, setDateTo] = useState("2025-12-31");

  // Inventory edit
  const [showInvEdit, setShowInvEdit] = useState(false);
  const [invForm, setInvForm] = useState({ beginDate: "2025-01-01", beginValue: "79104", beginItems: "15821", endDate: "2025-12-31", endValue: "70000", endItems: "14000" });

  // Purchases (purchase_orders table)
  const [purchases, setPurchases] = useState<any[]>([]);
  const [showPoForm, setShowPoForm] = useState(false);
  const [poForm, setPoForm] = useState({ vendor: "", purchase_date: new Date().toISOString().slice(0, 10), source_type: "thrift", subtotal: "", tax: "", payment_method: "credit_card", notes: "" });

  // Inventory Items
  const [invItems, setInvItems] = useState<any[]>([]);
  const [showInvForm, setShowInvForm] = useState(false);
  const [invItemForm, setInvItemForm] = useState({ sku: "", asin: "", title: "", purchase_date: new Date().toISOString().slice(0,10), purchase_price: "", quantity_purchased: "1", source: "thrift", source_name: "", condition: "Used - Good", list_price: "", notes: "" });

  // Purchase Batches
  const [batches, setBatches] = useState<any[]>([]);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchForm, setBatchForm] = useState({ batch_date: new Date().toISOString().slice(0,10), source_type: "thrift", source_name: "", total_cost: "", item_count: "", payment_method: "credit_card", notes: "" });

  // Mileage
  const [mileageLogs, setMileageLogs] = useState<any[]>([]);
  const [mileageSummary, setMileageSummary] = useState<any>(null);
  const [showMileageForm, setShowMileageForm] = useState(false);
  const [mileageForm, setMileageForm] = useState({ trip_date: new Date().toISOString().slice(0,10), purpose: "sourcing", from_location: "", to_location: "", miles: "", is_round_trip: false, notes: "" });
  const [invUploading, setInvUploading] = useState(false);
  const [invMsg, setInvMsg] = useState("");
  const [invSummary, setInvSummary] = useState<any>(null);
  const [defaultCost, setDefaultCost] = useState("5.00");

  // Inventory snapshots
  const [beginInv, setBeginInv] = useState(0);
  const [endInv, setEndInv] = useState(0);

  const supabase = createClient();

  // Check auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser(data.user);
    });
  }, []);

  // Load data
  useEffect(() => {
    if (!user) return;
    loadData();
    loadExpenses();
    loadBalanceSheet();
    loadBankTransactions();
    loadReconciliation();
    loadPnl();
    loadK1099();
    loadInventory();
    loadCOA();
    loadJournalEntries();
    loadTrialBalance();
    loadInvItems();
    loadBatches();
    loadMileage();
    loadPurchases();
  }, [user]);

  const loadData = async () => {
    const { data: pnl } = await supabase.from("v_monthly_pnl").select("*").limit(12);
    const { data: skus } = await supabase.from("v_sku_profitability").select("*").order("net_revenue", { ascending: false }).limit(50);
    const { data: fees } = await supabase.from("v_fee_breakdown").select("*");

    if (pnl && pnl.length > 0) {
      const totals = pnl.reduce((acc: any, row: any) => ({
        grossIncome: (acc.grossIncome || 0) + Number(row.gross_income),
        totalFees: (acc.totalFees || 0) + Number(row.total_fees),
        totalRefunds: (acc.totalRefunds || 0) + Number(row.total_refunds),
        totalReimbursements: (acc.totalReimbursements || 0) + Number(row.total_reimbursements),
        netAmount: (acc.netAmount || 0) + Number(row.net_amount),
        orderCount: (acc.orderCount || 0) + Number(row.order_count),
        refundCount: (acc.refundCount || 0) + Number(row.refund_count),
      }), {});

      const feeBreakdown: Record<string, number> = {};
      fees?.forEach((f: any) => {
        feeBreakdown[f.fee_type || "other"] = (feeBreakdown[f.fee_type || "other"] || 0) + Number(f.total_amount);
      });

      const monthlyChart = pnl.map((row: any) => ({
        month: row.month,
        income: Math.round(Number(row.gross_income) * 100) / 100,
        fees: Math.round(Math.abs(Number(row.total_fees)) * 100) / 100,
        net: Math.round(Number(row.net_amount) * 100) / 100,
      })).reverse();

      setSummary({
        ...totals,
        topProducts: skus || [],
        feeBreakdown,
        monthlyChart,
        skuCount: skus?.length || 0,
      });
    }
  };

  const loadExpenses = async () => {
    const { data } = await supabase
      .from("expense_transactions")
      .select("*, expense_categories(name)")
      .order("date", { ascending: false })
      .limit(100);
    if (data) setExpenses(data);
  };

  const loadBalanceSheet = async (from?: string, to?: string) => {
    const startDate = from || dateFrom;
    const endDate = to || dateTo;
    const { data } = await supabase.rpc("get_balance_sheet_by_daterange", { p_user_id: user.id, p_from: startDate, p_to: endDate });
    if (data && data.length > 0) setBalanceSheet(data[0]);
    else {
      const { data: viewData } = await supabase.from("v_balance_sheet").select("*").limit(1);
      if (viewData && viewData.length > 0) setBalanceSheet(viewData[0]);
    }
  };

  const loadBankTransactions = async () => {
    const { data } = await supabase
      .from("bank_transactions")
      .select("*, bank_imports(account_name, account_type)")
      .order("date", { ascending: false })
      .limit(500);
    if (data) setBankTxns(data);
  };

  const loadReconciliation = async (from?: string, to?: string) => {
    const startDate = from || dateFrom;
    const endDate = to || dateTo;
    const { data } = await supabase.rpc("get_reconciliation_by_daterange", { p_user_id: user.id, p_from: startDate, p_to: endDate });
    if (data) setReconData(data);
    else {
      const { data: viewData } = await supabase.from("v_accrual_vs_cash").select("*").order("month", { ascending: false }).limit(12);
      if (viewData) setReconData(viewData);
    }
  };

  const loadPnl = async (from?: string, to?: string) => {
    const startDate = from || dateFrom;
    const endDate = to || dateTo;
    const { data } = await supabase.rpc("get_pnl_by_daterange", { p_user_id: user.id, p_from: startDate, p_to: endDate });
    if (data && data.length > 0) setPnlData(data[0]);
    else {
      // Fallback to the view for backward compatibility
      const { data: viewData } = await supabase.from("v_profit_loss_statement").select("*").limit(1);
      if (viewData && viewData.length > 0) setPnlData(viewData[0]);
    }
  };

  const loadK1099 = async () => {
    const { data } = await supabase.from("v_1099k_reconciliation").select("*").order("month_num");
    if (data) setK1099Recon(data);
  };

  const loadInventory = async () => {
    const { data } = await supabase.from("inventory_snapshots").select("*").order("snapshot_date");
    if (data && data.length > 0) {
      const begin = data.find((d: any) => d.snapshot_date?.startsWith('2025-01-01'));
      const end = data.find((d: any) => d.snapshot_date?.startsWith('2025-12-31'));
      if (begin) {
        setBeginInv(Number(begin.total_value));
        setInvForm(prev => ({ ...prev, beginValue: String(begin.total_value), beginItems: String(begin.item_count || "15821"), beginDate: begin.snapshot_date }));
      }
      if (end) {
        setEndInv(Number(end.total_value));
        setInvForm(prev => ({ ...prev, endValue: String(end.total_value), endItems: String(end.item_count || "14000"), endDate: end.snapshot_date }));
      }
    }
  };

  const loadCOA = async () => {
    const { data } = await supabase.from("chart_of_accounts").select("*").order("account_number");
    if (data) setCoaAccounts(data);
  };

  const loadJournalEntries = async () => {
    const { data } = await supabase
      .from("journal_entries")
      .select("*, journal_entry_lines(*, chart_of_accounts(account_number, account_name))")
      .order("entry_date", { ascending: false })
      .limit(100);
    if (data) setJournalEntries(data);
  };

  const loadTrialBalance = async () => {
    const { data } = await supabase.from("v_trial_balance").select("*");
    if (data) setTrialBalance(data);
  };

  // Save COA account (add or update)
  const saveCOAAccount = async () => {
    if (!user || !coaForm.account_number || !coaForm.account_name) return;
    if (coaEditId) {
      await supabase.from("chart_of_accounts").update({
        account_number: coaForm.account_number, account_name: coaForm.account_name,
        account_type: coaForm.account_type, description: coaForm.description,
        beginning_balance: parseFloat(coaForm.beginning_balance) || 0,
      }).eq("id", coaEditId);
      setCoaEditId(null);
    } else {
      await supabase.from("chart_of_accounts").insert({
        user_id: user.id, account_number: coaForm.account_number, account_name: coaForm.account_name,
        account_type: coaForm.account_type, description: coaForm.description,
        beginning_balance: parseFloat(coaForm.beginning_balance) || 0,
      });
    }
    setCoaForm({ account_number: "", account_name: "", account_type: "asset", description: "", beginning_balance: "0" });
    await loadCOA();
    await loadTrialBalance();
  };

  // Save journal entry
  const saveJournalEntry = async () => {
    if (!user) return;
    const lines = jeForm.lines.filter(l => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));
    if (lines.length < 2) return alert("Journal entry needs at least 2 lines.");
    const totalDebits = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const totalCredits = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
    if (Math.abs(totalDebits - totalCredits) > 0.01) return alert(`Debits ($${totalDebits.toFixed(2)}) must equal Credits ($${totalCredits.toFixed(2)})`);

    const { data: je, error } = await supabase.from("journal_entries").insert({
      user_id: user.id, entry_date: jeForm.date, memo: jeForm.memo,
      is_opening_balance: jeForm.is_opening_balance, source: "manual", status: "posted",
    }).select().single();
    if (error || !je) return alert("Error creating journal entry: " + error?.message);

    const lineRows = lines.map((l, i) => ({
      journal_entry_id: je.id, account_id: l.account_id,
      debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0,
      memo: l.memo, sort_order: i,
    }));
    await supabase.from("journal_entry_lines").insert(lineRows);
    setShowJEForm(false);
    setJeForm({ date: new Date().toISOString().slice(0, 10), memo: "", is_opening_balance: false, lines: [{ account_id: "", debit: "", credit: "", memo: "" }, { account_id: "", debit: "", credit: "", memo: "" }] });
    await loadJournalEntries();
    await loadTrialBalance();
  };

  // Add JE line
  const addJELine = () => {
    setJeForm(prev => ({ ...prev, lines: [...prev.lines, { account_id: "", debit: "", credit: "", memo: "" }] }));
  };

  // Save inventory snapshots
  const saveInventory = async () => {
    if (!user) return;
    // Upsert beginning inventory
    await supabase.from("inventory_snapshots").upsert({
      user_id: user.id, snapshot_date: invForm.beginDate,
      total_value: parseFloat(invForm.beginValue) || 0,
      item_count: parseInt(invForm.beginItems) || null,
      notes: `Beginning inventory ${invForm.beginDate} — ${invForm.beginItems} items × $${(parseFloat(invForm.beginValue) / (parseInt(invForm.beginItems) || 1)).toFixed(2)} avg`,
      snapshot_type: "manual",
    }, { onConflict: "user_id,snapshot_date" });
    // Upsert ending inventory
    await supabase.from("inventory_snapshots").upsert({
      user_id: user.id, snapshot_date: invForm.endDate,
      total_value: parseFloat(invForm.endValue) || 0,
      item_count: parseInt(invForm.endItems) || null,
      notes: `Ending inventory ${invForm.endDate} — ${invForm.endItems} items × $${(parseFloat(invForm.endValue) / (parseInt(invForm.endItems) || 1)).toFixed(2)} avg`,
      snapshot_type: "manual",
    }, { onConflict: "user_id,snapshot_date" });
    // Update COA
    await supabase.from("chart_of_accounts").update({ beginning_balance: parseFloat(invForm.endValue) || 0 }).eq("account_number", "1200").eq("user_id", user.id);
    setShowInvEdit(false);
    await loadInventory();
    await loadPnl();
    alert("Inventory saved!");
  };

  // Inventory report upload handler
  const handleInventoryUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setInvUploading(true);
    setInvMsg("Parsing inventory report...");
    try {
      const text = await file.text();
      const result = parseInventoryReport(text) as any;
      if (result.error) { setInvMsg(`Error: ${result.error}`); setInvUploading(false); return; }

      setInvMsg(`Found ${result.summary?.uniqueSkus} SKUs, ${result.summary?.totalUnits} total units (${result.format}). Saving...`);
      const snapshotDate = result.snapshotDate || new Date().toISOString().slice(0, 10);
      const cost = parseFloat(defaultCost) || 5.00;

      // Batch insert inventory counts
      const rows = result.items.map((item: any) => ({
        user_id: user.id, snapshot_date: snapshotDate, sku: item.sku, fnsku: item.fnsku,
        asin: item.asin, product_name: item.title, quantity_sellable: item.disposition === "SELLABLE" ? item.quantity : 0,
        quantity_unsellable: item.disposition !== "SELLABLE" ? item.quantity : 0,
        quantity_total: item.quantity, fulfillment_center: item.fc, disposition: item.disposition,
      }));

      for (let i = 0; i < rows.length; i += 500) {
        await supabase.from("inventory_counts").upsert(rows.slice(i, i + 500), { onConflict: "user_id,snapshot_date,sku,fulfillment_center", ignoreDuplicates: false });
      }

      // Also upsert SKU costs for items that don't have a cost yet (using default avg cost)
      const skuCosts = [...new Map(result.items.map((item: any) => [item.sku, item])).values()].map((item: any) => ({
        user_id: user.id, sku: item.sku, asin: item.asin, product_name: item.title,
        unit_cost: cost, source: "avg_cost", notes: `Default avg cost $${cost.toFixed(2)}`,
      }));
      for (let i = 0; i < skuCosts.length; i += 500) {
        await supabase.from("sku_costs").upsert(skuCosts.slice(i, i + 500), { onConflict: "user_id,sku", ignoreDuplicates: true });
      }

      // Update inventory snapshot total
      const totalValue = result.summary!.totalSellable * cost;
      await supabase.from("inventory_snapshots").upsert({
        user_id: user.id, snapshot_date: snapshotDate, total_value: totalValue,
        item_count: result.summary!.totalUnits, snapshot_type: "report",
        notes: `From ${file.name}: ${result.summary!.uniqueSkus} SKUs, ${result.summary!.totalUnits} units × $${cost.toFixed(2)} avg`,
      }, { onConflict: "user_id,snapshot_date" });

      setInvSummary({ ...result.summary, snapshotDate, totalValue, cost });
      setInvMsg(`Done! ${result.summary!.uniqueSkus} SKUs, ${result.summary!.totalUnits} units. Valued at $${totalValue.toLocaleString()} ($${cost.toFixed(2)}/unit avg).`);
      await loadInventory();
      await loadBalanceSheet();
    } catch (err: any) { setInvMsg(`Error: ${err.message}`); }
    finally { setInvUploading(false); }
  }, [user, supabase, defaultCost]);

  // Load inventory items
  const loadInvItems = async () => {
    const { data } = await supabase.from("inventory_items").select("*").order("purchase_date", { ascending: false }).limit(200);
    if (data) setInvItems(data);
  };
  const saveInvItem = async () => {
    if (!user || !invItemForm.title) return;
    await supabase.from("inventory_items").insert({
      user_id: user.id, sku: invItemForm.sku, asin: invItemForm.asin, title: invItemForm.title,
      purchase_date: invItemForm.purchase_date, purchase_price: parseFloat(invItemForm.purchase_price) || 0,
      quantity_purchased: parseInt(invItemForm.quantity_purchased) || 1,
      source: invItemForm.source, source_name: invItemForm.source_name,
      condition: invItemForm.condition, list_price: parseFloat(invItemForm.list_price) || null, notes: invItemForm.notes,
    });
    setShowInvForm(false);
    setInvItemForm({ sku: "", asin: "", title: "", purchase_date: new Date().toISOString().slice(0,10), purchase_price: "", quantity_purchased: "1", source: "thrift", source_name: "", condition: "Used - Good", list_price: "", notes: "" });
    await loadInvItems();
  };

  // Load purchase batches
  const loadBatches = async () => {
    const { data } = await supabase.from("purchase_batches").select("*").order("batch_date", { ascending: false }).limit(100);
    if (data) setBatches(data);
  };
  const saveBatch = async () => {
    if (!user || !batchForm.total_cost) return;
    await supabase.from("purchase_batches").insert({
      user_id: user.id, batch_date: batchForm.batch_date, source_type: batchForm.source_type,
      source_name: batchForm.source_name, total_cost: parseFloat(batchForm.total_cost) || 0,
      item_count: parseInt(batchForm.item_count) || 0, payment_method: batchForm.payment_method, notes: batchForm.notes,
    });
    setShowBatchForm(false);
    setBatchForm({ batch_date: new Date().toISOString().slice(0,10), source_type: "thrift", source_name: "", total_cost: "", item_count: "", payment_method: "credit_card", notes: "" });
    await loadBatches();
  };

  // Load mileage
  const loadMileage = async () => {
    const { data } = await supabase.from("mileage_logs").select("*").order("trip_date", { ascending: false }).limit(200);
    if (data) setMileageLogs(data);
    const { data: summary } = await supabase.from("v_mileage_summary").select("*");
    if (summary && summary.length > 0) setMileageSummary(summary[0]);
  };
  const saveMileage = async () => {
    if (!user || !mileageForm.miles) return;
    const totalMiles = parseFloat(mileageForm.miles) * (mileageForm.is_round_trip ? 2 : 1);
    await supabase.from("mileage_logs").insert({
      user_id: user.id, trip_date: mileageForm.trip_date, purpose: mileageForm.purpose,
      from_location: mileageForm.from_location, to_location: mileageForm.to_location,
      miles: totalMiles, is_round_trip: mileageForm.is_round_trip, notes: mileageForm.notes,
    });
    setShowMileageForm(false);
    setMileageForm({ trip_date: new Date().toISOString().slice(0,10), purpose: "sourcing", from_location: "", to_location: "", miles: "", is_round_trip: false, notes: "" });
    await loadMileage();
  };

  const loadPurchases = async () => {
    const { data } = await supabase.from("purchase_orders").select("*").order("purchase_date", { ascending: false }).limit(200);
    if (data) setPurchases(data);
  };

  // Bank CSV upload handler
  const handleBankUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setBankUploading(true);
    setBankMsg("Parsing bank statement...");
    try {
      const text = await file.text();
      const result = parseBankStatement(text);
      if (result.error) { setBankMsg(`Error: ${result.error}`); setBankUploading(false); return; }
      setBankMsg(`Found ${result.rowCount} transactions (${result.bankDetected}). Saving...`);

      const { data: bankImport, error: impErr } = await supabase
        .from("bank_imports")
        .insert({ user_id: user.id, filename: file.name, account_name: file.name.replace(/\.[^.]+$/, ''), account_type: result.accountType, row_count: result.rowCount, status: "completed" })
        .select().single();
      if (impErr) throw impErr;

      const txRows = result.transactions.map((tx: any) => ({
        user_id: user.id, import_id: bankImport.id, date: tx.date, description: tx.description,
        amount: tx.amount, balance: tx.balance, transaction_type: tx.type,
        ai_category_suggestion: tx.suggestedCategory, ai_confidence: tx.confidence,
        category_suggestion: tx.suggestedCategory,
      }));

      for (let i = 0; i < txRows.length; i += 500) {
        const { error: batchErr } = await supabase.from("bank_transactions").upsert(txRows.slice(i, i + 500), { onConflict: "user_id,date,description,amount,import_id", ignoreDuplicates: true });
        if (batchErr && !batchErr.message?.includes("duplicate")) console.warn("Bank batch error:", batchErr.message);
        setBankMsg(`Saved ${Math.min(i + 500, txRows.length)} of ${txRows.length}...`);
      }
      setBankMsg(`Done! ${result.rowCount} transactions imported (duplicates skipped).`);
      await loadBankTransactions();
    } catch (err: any) { setBankMsg(`Error: ${err.message}`); }
    finally { setBankUploading(false); }
  }, [user, supabase]);

  // Tag bank transaction as business/personal/split
  const tagTransaction = async (txId: string, isBusiness: boolean | null, splitAmount?: number) => {
    const update: any = { is_business: isBusiness, manually_reviewed: true, reviewed_at: new Date().toISOString() };
    if (splitAmount !== undefined) update.split_amount = splitAmount;
    await supabase.from("bank_transactions").update(update).eq("id", txId);
    setBankTxns(prev => prev.map(t => t.id === txId ? { ...t, ...update } : t));
  };

  // Filtered bank transactions
  const filteredBankTxns = useMemo(() => {
    if (bankFilter === "all") return bankTxns;
    if (bankFilter === "unreviewed") return bankTxns.filter(t => t.is_business === null);
    if (bankFilter === "business") return bankTxns.filter(t => t.is_business === true);
    return bankTxns.filter(t => t.is_business === false);
  }, [bankTxns, bankFilter]);

  const bankStats = useMemo(() => ({
    total: bankTxns.length,
    unreviewed: bankTxns.filter(t => t.is_business === null).length,
    business: bankTxns.filter(t => t.is_business === true).length,
    personal: bankTxns.filter(t => t.is_business === false).length,
  }), [bankTxns]);

  // File upload handler
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    setUploading(true);
    const totalFiles = files.length;
    let successCount = 0;
    let totalTxCount = 0;

    for (let f = 0; f < totalFiles; f++) {
      const file = files[f];
      setUploadMsg(`Processing file ${f + 1} of ${totalFiles}: ${file.name}...`);

      try {
        const text = await file.text();
        const result = parseSettlementReport(text) as ParseResult;

        if (result.error) {
          setUploadMsg(`File ${f + 1}/${totalFiles} error: ${result.error}. Skipping...`);
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        // Insert report
        const { data: report, error: reportErr } = await supabase
          .from("settlement_reports")
          .insert({
            user_id: user.id,
            filename: file.name,
            settlement_id: result.metadata?.settlementId,
            settlement_start_date: result.metadata?.settlementStartDate,
            settlement_end_date: result.metadata?.settlementEndDate,
            deposit_date: result.metadata?.depositDate,
            total_amount: result.metadata?.totalAmount,
            row_count: result.rowCount,
            status: "completed",
            processed_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (reportErr) { 
          if (reportErr.message?.includes("duplicate") || reportErr.message?.includes("unique")) {
            setUploadMsg(`File ${f + 1}/${totalFiles}: "${file.name}" already uploaded. Skipping...`);
          } else {
            setUploadMsg(`File ${f + 1} DB error: ${reportErr.message}`);
          }
          continue; 
        }

        // Batch insert transactions
        const txRows = result.transactions.map((tx: any) => ({
          user_id: user.id, report_id: report.id,
          settlement_id: tx.settlementId, transaction_type: tx.transactionType,
          order_id: tx.orderId, merchant_order_id: tx.merchantOrderId,
          adjustment_id: tx.adjustmentId, shipment_id: tx.shipmentId,
          marketplace_name: tx.marketplaceName, amount_type: tx.amountType,
          amount_description: tx.amountDescription, amount: tx.amount,
          quantity_purchased: tx.quantityPurchased,
          posted_date: tx.postedDate, posted_date_time: tx.postedDateTime,
          sku: tx.sku, asin: tx.asin,
          category: tx.category, subcategory: tx.subcategory,
        }));

        for (let i = 0; i < txRows.length; i += 500) {
          const { error: batchErr } = await supabase.from("settlement_transactions").upsert(txRows.slice(i, i + 500), { onConflict: "user_id,posted_date,order_id,amount_type,amount_description,amount", ignoreDuplicates: true });
          if (batchErr && !batchErr.message?.includes("duplicate")) console.warn("Batch error:", batchErr.message);
        }

        successCount++;
        totalTxCount += result.rowCount;
        setUploadMsg(`File ${f + 1}/${totalFiles} done (${result.rowCount} txns). Total so far: ${totalTxCount}`);
      } catch (err: any) {
        setUploadMsg(`File ${f + 1} error: ${err.message}. Continuing...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    setUploadMsg(`Complete! ${successCount}/${totalFiles} files imported with ${totalTxCount} total transactions.`);
    if (successCount > 0) {
      setShowUpload(false);
      await loadData();
    }
    setUploading(false);
  }, [user, supabase]);

  // Add expense
  const addExpense = async () => {
    if (!newExp.amount || !user) return;
    // Get category ID
    const { data: cats } = await supabase.from("expense_categories").select("id").eq("name", newExp.category).limit(1);
    const catId = cats?.[0]?.id;

    await supabase.from("expense_transactions").insert({
      user_id: user.id,
      category_id: catId,
      date: newExp.date,
      amount: parseFloat(newExp.amount),
      vendor: newExp.vendor,
      description: newExp.description,
    });

    setNewExp({ date: new Date().toISOString().slice(0, 10), category: EXPENSE_CATS[0], amount: "", vendor: "", description: "" });
    await loadExpenses();
  };

  // AI Chat
  const handleAiSend = async () => {
    if (!aiInput.trim()) return;
    const question = aiInput.trim();
    setAiMessages((prev) => [...prev, { role: "user", content: question }]);
    setAiInput("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, summary, expenses }),
      });
      const data = await res.json();
      setAiMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch {
      setAiMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't process that right now. Try again." }]);
    }
  };

  // Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);
  const cogsTotal = useMemo(() => expenses.filter((e: any) => e.expense_categories?.name === 'Cost of Goods Sold').reduce((s: number, e: any) => s + Number(e.amount), 0), [expenses]);
  const cogsPurchases = cogsTotal; // Raw purchases amount
  const actualCogs = beginInv + cogsPurchases - endInv; // Schedule C Part III formula
  const operatingExpenses = useMemo(() => expenses.filter((e: any) => e.expense_categories?.name !== 'Cost of Goods Sold').reduce((s: number, e: any) => s + Number(e.amount), 0), [expenses]);
  const cogsItems = useMemo(() => expenses.filter((e: any) => e.expense_categories?.name === 'Cost of Goods Sold'), [expenses]);
  const opexItems = useMemo(() => expenses.filter((e: any) => e.expense_categories?.name !== 'Cost of Goods Sold'), [expenses]);
  const hasData = summary && summary.grossIncome;

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: TrendingUp },
    { id: "pnl", label: "P&L", icon: FileText },
    { id: "products", label: "Products", icon: Package },
    { id: "fees", label: "Fees", icon: DollarSign },
    { id: "banking", label: "Banking", icon: Landmark },
    { id: "reconcile", label: "Reconcile", icon: CheckCircle },
    { id: "balance", label: "Balance Sheet", icon: BarChart3 },
    { id: "expenses", label: "Expenses", icon: FileText },
    { id: "coa", label: "Chart of Accts", icon: BarChart3 },
    { id: "journal", label: "Journal Entries", icon: FileText },
    { id: "inventory", label: "Inventory", icon: Package },
    { id: "purchases", label: "Purchases", icon: DollarSign },
    { id: "mileage", label: "Mileage", icon: TrendingUp },
    { id: "ask", label: "Ask AI", icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-[#0A0F1C]">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-xs font-bold text-white">S</div>
          <span className="font-bold text-base">ShelfKeeper</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowUpload(!showUpload)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition">
            <Upload size={14} /> Upload Report
          </button>
          {user && (
            <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-gray-300 transition">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Upload Panel */}
      {showUpload && (
        <div className="border-b border-gray-800 bg-[#111827] p-6">
          <div className="max-w-xl mx-auto">
            <label className="block border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-xl p-8 text-center cursor-pointer transition">
              <Upload size={32} className="mx-auto mb-3 text-gray-500" />
              <div className="font-semibold mb-1">Drop your Amazon Settlement Reports</div>
              <div className="text-sm text-gray-500 mb-2">Select ALL files at once — Seller Central → Reports → Payments → Download Flat File</div>
              <div className="text-sm text-gray-600">Supports V1 Flat File, V2 Flat File, and Date Range Reports (TSV/CSV)</div>
              <input type="file" accept=".tsv,.csv,.txt" onChange={handleFileUpload} className="hidden" disabled={uploading} multiple />
            </label>
            {uploadMsg && (
              <div className={`mt-3 text-sm text-center ${uploadMsg.startsWith("Error") ? "text-red-400" : uploadMsg.startsWith("Done") ? "text-green-400" : "text-indigo-400"}`}>
                {uploadMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-800 px-6 flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
            tab === t.id ? "border-indigo-500 text-indigo-400" : "border-transparent text-gray-500 hover:text-gray-300"
          }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-6">

        {/* No data state */}
        {!hasData && tab === "dashboard" && (
          <div className="text-center py-20">
            <Upload size={48} className="mx-auto mb-4 text-gray-600" />
            <h2 className="text-xl font-bold mb-2">Welcome to ShelfKeeper</h2>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">Upload your Amazon Settlement Report to see your P&L, fee breakdown, product profitability, and more.</p>
            <button onClick={() => setShowUpload(true)} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium transition">
              Upload Your First Report
            </button>
          </div>
        )}

        {/* ── DASHBOARD TAB ──────────────────────────── */}
        {hasData && tab === "dashboard" && (
          <div>
            <h2 className="text-lg font-bold mb-4">Financial Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <MetricCard label="GROSS INCOME" value={fmt(summary.grossIncome)} color="text-emerald-400" sub={`${summary.orderCount} orders`} />
              <MetricCard label="AMAZON FEES" value={fmt(summary.totalFees)} color="text-red-400" sub={summary.grossIncome ? fmtPct(Math.abs(summary.totalFees / summary.grossIncome)) : "0%"} />
              <MetricCard label="REFUNDS" value={fmt(summary.totalRefunds)} color="text-amber-400" sub={`${summary.refundCount} returns`} />
              <MetricCard label="NET PROFIT" value={fmt(summary.netAmount)} color="text-indigo-400" sub={`After expenses: ${fmt(summary.netAmount - totalExpenses)}`} />
            </div>

            {/* Chart */}
            {summary.monthlyChart?.length > 0 && (
              <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 mb-6">
                <div className="text-sm font-semibold mb-4">Revenue vs Fees by Month</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={summary.monthlyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v: string) => v?.slice(0, 7)} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 13 }} />
                    <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Income" />
                    <Bar dataKey="fees" fill="#ef4444" radius={[4, 4, 0, 0]} name="Fees" />
                    <Bar dataKey="net" fill="#818cf8" radius={[4, 4, 0, 0]} name="Net" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top Products Preview */}
            {summary.topProducts?.length > 0 && (
              <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-sm font-semibold">Top Products by Net Revenue</div>
                  <button onClick={() => setTab("products")} className="text-xs text-indigo-400 hover:text-indigo-300">View all →</button>
                </div>
                <div className="space-y-2">
                  {summary.topProducts.slice(0, 5).map((p: any, i: number) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                      <div>
                        <span className="text-sm font-mono text-indigo-400">{p.sku}</span>
                        <span className="text-xs text-gray-500 ml-2">{p.units_sold} units</span>
                      </div>
                      <span className={`text-sm font-mono font-semibold ${Number(p.net_revenue) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {fmt(Number(p.net_revenue))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}


        {/* ── P&L STATEMENT TAB ──────────────────────── */}
        {tab === "pnl" && (
          <div>
            {/* Date Range Picker */}
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-500 font-medium">DATE RANGE:</span>
                <input type="date" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                <span className="text-gray-600">to</span>
                <input type="date" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                <button onClick={() => loadPnl()} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-medium transition">Apply</button>
                <div className="flex gap-1 ml-2">
                  {[
                    { label: "Full Year", from: "2025-01-01", to: "2025-12-31" },
                    { label: "Q1", from: "2025-01-01", to: "2025-03-31" },
                    { label: "Q2", from: "2025-04-01", to: "2025-06-30" },
                    { label: "Q3", from: "2025-07-01", to: "2025-09-30" },
                    { label: "Q4", from: "2025-10-01", to: "2025-12-31" },
                  ].map(p => (
                    <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to); loadPnl(p.from, p.to); }}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition ${dateFrom === p.from && dateTo === p.to ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>{p.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-lg font-bold">Profit & Loss Statement</h2>
                <p className="text-sm text-gray-500">{dateFrom} to {dateTo} — Schedule C Format</p>
              </div>
              {pnlData && (
                <div className="text-right">
                  <div className="text-xs text-gray-500">{pnlData.total_orders?.toLocaleString()} orders · {pnlData.unique_skus?.toLocaleString()} SKUs</div>
                  <div className="text-xs text-gray-500">{pnlData.total_refund_orders} refund orders</div>
                </div>
              )}
            </div>

            {pnlData ? (
              <div className="space-y-3">

                {/* ── SECTION 1: REVENUE (Schedule C Lines 1-3) ── */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3">Revenue · Schedule C Lines 1–3</div>
                  
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-400">Line 1 · Gross receipts (matches 1099-K Box 1a)</span>
                    <span className="text-sm font-mono text-gray-200">{fmt(Number(pnlData.gross_revenue) + Number(pnlData.tax_collected))}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50 pl-4">
                    <span className="text-xs text-gray-500">Product sales</span>
                    <span className="text-xs font-mono text-gray-400">{fmt(Number(pnlData.product_sales))}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50 pl-4">
                    <span className="text-xs text-gray-500">Shipping income</span>
                    <span className="text-xs font-mono text-gray-400">{fmt(Number(pnlData.shipping_income))}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50 pl-4">
                    <span className="text-xs text-gray-500">Gift wrap</span>
                    <span className="text-xs font-mono text-gray-400">{fmt(Number(pnlData.gift_wrap_income))}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50 pl-4">
                    <span className="text-xs text-gray-500">Sales tax collected (pass-through)</span>
                    <span className="text-xs font-mono text-gray-400">{fmt(Number(pnlData.tax_collected))}</span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-gray-800/50 mt-2">
                    <span className="text-sm text-gray-400">Line 2 · Returns and allowances</span>
                    <span className="text-sm font-mono text-red-400">{fmt(Math.abs(Number(pnlData.returns_refunds)))}</span>
                  </div>

                  <div className="flex justify-between pt-3 mt-1">
                    <span className="text-sm font-bold text-emerald-400">Line 3 · Gross revenue (excl. tax)</span>
                    <span className="text-base font-bold font-mono text-emerald-400">{fmt(Number(pnlData.gross_revenue))}</span>
                  </div>
                </div>

                {/* ── SECTION 2: COGS (Schedule C Part III, Lines 35-42) ── */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">Cost of Goods Sold · Schedule C Part III</div>

                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-400">Line 35 · Method of valuation</span>
                    <span className="text-xs text-gray-500">Cost / FIFO</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-400">Line 36 · Beginning inventory (Jan 1)</span>
                    <span className="text-sm font-mono text-gray-200">{fmt(beginInv)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-400">Line 37 · Purchases less personal use</span>
                    <span className={`text-sm font-mono ${cogsTotal > 0 ? "text-gray-200" : "text-gray-500 italic"}`}>{cogsTotal > 0 ? fmt(cogsTotal) : "$0.00"}</span>
                  </div>
                  {cogsItems.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between py-1 border-b border-gray-800/30 pl-4">
                      <span className="text-xs text-gray-500">{item.description || item.vendor}</span>
                      <span className="text-xs font-mono text-gray-400">{fmt(Number(item.amount))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-400">Line 38 · Cost of labor</span>
                    <span className="text-sm font-mono text-gray-500">$0.00</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-400">Line 39 · Materials and supplies</span>
                    <span className="text-sm font-mono text-gray-500">$0.00</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-400">Line 40 · Other costs</span>
                    <span className="text-sm font-mono text-gray-500">$0.00</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-400">Line 41 · Add lines 36 through 40</span>
                    <span className="text-sm font-mono text-gray-200">{fmt(beginInv + cogsPurchases)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-400">Line 42 · Ending inventory (Dec 31)</span>
                    <span className="text-sm font-mono text-gray-200">{fmt(endInv)}</span>
                  </div>

                  <div className="flex justify-between pt-3 mt-1">
                    <span className="text-sm font-bold text-amber-400">Line 4 · COGS (Line 41 minus Line 42)</span>
                    <span className="text-base font-bold font-mono text-amber-400">{fmt(actualCogs)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-3">
                    <p className="text-xs text-gray-600">Upload credit card statements in Banking tab and tag sourcing purchases. Or add manually in Expenses tab under Cost of Goods Sold.</p>
                    <button onClick={() => setShowInvEdit(!showInvEdit)} className="text-xs text-amber-400 hover:text-amber-300 whitespace-nowrap ml-3">
                      {showInvEdit ? "Cancel" : "Edit Inventory"}
                    </button>
                  </div>

                  {showInvEdit && (
                    <div className="mt-4 bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                      <div className="text-xs font-bold text-amber-400 uppercase mb-3">Edit Inventory Values</div>
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div>
                          <label className="text-[10px] text-gray-500">Beginning Date</label>
                          <input type="date" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={invForm.beginDate} onChange={e => setInvForm(p => ({ ...p, beginDate: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">Beginning Value ($)</label>
                          <input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={invForm.beginValue} onChange={e => setInvForm(p => ({ ...p, beginValue: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">Item Count</label>
                          <input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={invForm.beginItems} onChange={e => setInvForm(p => ({ ...p, beginItems: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div>
                          <label className="text-[10px] text-gray-500">Ending Date</label>
                          <input type="date" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={invForm.endDate} onChange={e => setInvForm(p => ({ ...p, endDate: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">Ending Value ($)</label>
                          <input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={invForm.endValue} onChange={e => setInvForm(p => ({ ...p, endValue: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">Item Count</label>
                          <input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={invForm.endItems} onChange={e => setInvForm(p => ({ ...p, endItems: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Avg cost/item: ${(parseFloat(invForm.endValue) / (parseInt(invForm.endItems) || 1)).toFixed(2)}</span>
                        <button onClick={saveInventory} className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-medium transition">Save Inventory</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── GROSS PROFIT ── */}
                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl px-5 py-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-indigo-400">Line 5 · GROSS PROFIT</span>
                    <span className="text-lg font-bold font-mono text-indigo-400">{fmt(Number(pnlData.gross_revenue) - actualCogs)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Gross revenue ({fmt(Number(pnlData.gross_revenue))}) minus COGS ({fmt(actualCogs)})</div>
                </div>

                {/* ── SECTION 3: AMAZON SELLING FEES ── */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                  <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">Amazon Selling Fees · Schedule C Line 10</div>
                  {[
                    { label: "Referral fees (15% commission)", value: Number(pnlData.referral_fees), pct: Number(pnlData.referral_fees) / Number(pnlData.gross_revenue) },
                    { label: "FBA fulfillment fees", value: Number(pnlData.fba_fulfillment_fees), pct: Number(pnlData.fba_fulfillment_fees) / Number(pnlData.gross_revenue) },
                    { label: "FBA inventory and inbound services", value: Number(pnlData.fba_inventory_fees), pct: Number(pnlData.fba_inventory_fees) / Number(pnlData.gross_revenue) },
                    { label: "Shipping label purchases", value: Number(pnlData.shipping_label_costs), pct: Number(pnlData.shipping_label_costs) / Number(pnlData.gross_revenue) },
                    { label: "Service fees", value: Number(pnlData.service_fees), pct: Number(pnlData.service_fees) / Number(pnlData.gross_revenue) },
                    { label: "Promotional costs", value: Number(pnlData.promotional_costs), pct: Number(pnlData.promotional_costs) / Number(pnlData.gross_revenue) },
                    { label: "Other selling fees", value: Number(pnlData.other_selling_fees), pct: 0 },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-gray-800/50">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-300">{row.label}</span>
                        {row.pct > 0.01 && <span className="text-[10px] text-gray-600">{fmtPct(row.pct)}</span>}
                      </div>
                      <span className="text-sm font-mono text-red-400">-{fmt(row.value)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 mt-1">
                    <span className="text-sm font-bold text-red-400">TOTAL AMAZON SELLING FEES</span>
                    <span className="text-base font-bold font-mono text-red-400">-{fmt(Number(pnlData.total_selling_fees))}</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-2">Fee ratio: {fmtPct(Number(pnlData.total_selling_fees) / Number(pnlData.gross_revenue))} of gross revenue</div>
                </div>

                {/* ── SECTION 4: OTHER EXPENSES ── */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                  <div className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-3">Other Expenses · Schedule C Lines 8–27</div>
                  {opexItems.length > 0 ? (
                    <>
                      {opexItems.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between items-center py-1.5 border-b border-gray-800/50">
                          <div>
                            <span className="text-sm text-gray-300">{item.expense_categories?.name || "Expense"}</span>
                            <span className="text-xs text-gray-600 ml-2">{item.description}</span>
                          </div>
                          <span className="text-sm font-mono text-red-400">-{fmt(Number(item.amount))}</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      {[
                        { label: "Line 9 · Car and truck expenses", sch: "Vehicle mileage at $0.70/mi" },
                        { label: "Line 15 · Insurance", sch: "Business insurance" },
                        { label: "Line 17 · Legal and professional", sch: "Tax prep, bookkeeping" },
                        { label: "Line 18 · Office expense", sch: "Supplies, printer ink" },
                        { label: "Line 22 · Supplies", sch: "Packaging, shipping supplies" },
                        { label: "Line 25 · Utilities", sch: "Internet (business portion)" },
                        { label: "Line 27a · Other expenses", sch: "Software, subscriptions" },
                      ].map(row => (
                        <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-gray-800/50">
                          <div>
                            <span className="text-sm text-gray-300">{row.label}</span>
                            <span className="text-xs text-gray-600 ml-2">{row.sch}</span>
                          </div>
                          <span className="text-sm font-mono text-gray-500 italic">{"\u2014"}</span>
                        </div>
                      ))}
                    </>
                  )}
                  <div className="flex justify-between pt-3 mt-1">
                    <span className="text-sm font-bold text-orange-400">TOTAL OTHER EXPENSES</span>
                    <span className="text-base font-bold font-mono text-orange-400">-{fmt(operatingExpenses)}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">Add expenses in the Expenses tab or upload bank/credit card statements in Banking tab.</p>
                </div>

                {/* ── TAX PASS-THROUGH ── */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Sales Tax Pass-Through (not deductible)</div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-500">Marketplace tax withheld by Amazon</span>
                    <span className="text-sm font-mono text-gray-500">-{fmt(Number(pnlData.marketplace_tax_withheld))}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-sm text-gray-500">Net tax effect (collected minus withheld)</span>
                    <span className="text-sm font-mono text-gray-500">{fmt(Number(pnlData.tax_collected) - Number(pnlData.marketplace_tax_withheld))}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">Amazon collects and remits as marketplace facilitator. Not your income or expense.</p>
                </div>

                {/* ── NET PROFIT BOX ── */}
                <div className={`rounded-xl p-5 border-2 ${Number(pnlData.net_amazon_profit) - actualCogs - operatingExpenses >= 0 ? "bg-emerald-500/5 border-emerald-500/30" : "bg-red-500/5 border-red-500/30"}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-bold text-white uppercase tracking-wider">Line 31 · NET PROFIT</div>
                      <div className="text-xs text-gray-500 mt-1">Gross Profit minus Amazon Fees minus Expenses</div>
                    </div>
                    <span className={`text-2xl font-bold font-mono ${Number(pnlData.net_amazon_profit) - actualCogs - operatingExpenses >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmt(Number(pnlData.net_amazon_profit) - actualCogs - operatingExpenses)}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-3 mt-4 text-center">
                    <div className="bg-black/20 rounded-lg p-2">
                      <div className="text-[10px] text-gray-500 uppercase">Revenue</div>
                      <div className="text-sm font-mono text-emerald-400 mt-0.5">{fmt(Number(pnlData.gross_revenue))}</div>
                    </div>
                    <div className="bg-black/20 rounded-lg p-2">
                      <div className="text-[10px] text-gray-500 uppercase">COGS</div>
                      <div className="text-sm font-mono text-amber-400 mt-0.5">-{fmt(actualCogs)}</div>
                    </div>
                    <div className="bg-black/20 rounded-lg p-2">
                      <div className="text-[10px] text-gray-500 uppercase">Amazon Fees</div>
                      <div className="text-sm font-mono text-red-400 mt-0.5">-{fmt(Number(pnlData.total_selling_fees))}</div>
                    </div>
                    <div className="bg-black/20 rounded-lg p-2">
                      <div className="text-[10px] text-gray-500 uppercase">Expenses</div>
                      <div className="text-sm font-mono text-orange-400 mt-0.5">-{fmt(operatingExpenses)}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-gray-600 text-center">Bank transfers to date: {fmt(Number(pnlData.bank_transfers))}</div>
                </div>

                {/* ── 1099-K RECONCILIATION ── */}
                {k1099Recon.length > 0 && k1099Recon[0]?.k1099_monthly && (
                  <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                    <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3">1099-K Reconciliation</div>
                    <p className="text-xs text-gray-500 mb-4">Comparing our gross (Order-only transactions) to 1099-K monthly amounts from Amazon. Small differences are normal due to invoicing timing.</p>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left py-2 text-gray-500 font-medium">Month</th>
                            <th className="text-right py-2 text-gray-500 font-medium">Our Gross</th>
                            <th className="text-right py-2 text-gray-500 font-medium">1099-K</th>
                            <th className="text-right py-2 text-gray-500 font-medium">Diff</th>
                          </tr>
                        </thead>
                        <tbody>
                          {k1099Recon.map((row: any) => {
                            const diff = Number(row.monthly_difference);
                            const mn = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                            return (
                              <tr key={row.month_num} className="border-b border-gray-800/50">
                                <td className="py-1.5 text-gray-300">{mn[row.month_num]}</td>
                                <td className="py-1.5 text-right font-mono text-gray-300">{fmt(Number(row.our_1099k_gross))}</td>
                                <td className="py-1.5 text-right font-mono text-gray-300">{fmt(Number(row.k1099_monthly))}</td>
                                <td className={`py-1.5 text-right font-mono ${Math.abs(diff) < 100 ? "text-emerald-400" : Math.abs(diff) < 300 ? "text-amber-400" : "text-red-400"}`}>
                                  {diff >= 0 ? "+" : ""}{fmt(diff)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-700">
                            <td className="py-2 font-bold text-cyan-400">TOTAL</td>
                            <td className="py-2 text-right font-mono font-bold text-cyan-400">
                              {fmt(k1099Recon.reduce((s: number, r: any) => s + Number(r.our_1099k_gross), 0))}
                            </td>
                            <td className="py-2 text-right font-mono font-bold text-cyan-400">
                              {fmt(Number(k1099Recon[0]?.k1099_annual_gross || 0))}
                            </td>
                            <td className="py-2 text-right font-mono font-bold text-amber-400">
                              {fmt(k1099Recon.reduce((s: number, r: any) => s + Number(r.monthly_difference), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="text-xs text-gray-600 mt-3">Total difference of ~$1,400 is from invoicing date vs posting date timing. Amazon notes this on the 1099-K supplement.</p>
                  </div>
                )}

              </div>
            ) : (
              <div className="text-center py-16 text-gray-500">Upload a settlement report to generate your P&L statement.</div>
            )}
          </div>
        )}

        {/* ── PRODUCTS TAB ───────────────────────────── */}
        {tab === "products" && (
          <div>
            <h2 className="text-lg font-bold mb-4">SKU Profitability</h2>
            {summary?.topProducts?.length > 0 ? (
              <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {["SKU", "ASIN", "Units", "Revenue", "Fees", "Net Revenue"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.topProducts.map((p: any, i: number) => (
                        <tr key={i} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-mono text-indigo-400 text-xs">{p.sku}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.asin}</td>
                          <td className="px-4 py-3 font-mono">{p.units_sold}</td>
                          <td className="px-4 py-3 font-mono text-emerald-400">{fmt(Number(p.revenue))}</td>
                          <td className="px-4 py-3 font-mono text-red-400">{fmt(Number(p.fees))}</td>
                          <td className={`px-4 py-3 font-mono font-semibold ${Number(p.net_revenue) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {fmt(Number(p.net_revenue))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500">Upload a settlement report to see product profitability.</div>
            )}
          </div>
        )}

        {/* ── FEES TAB ───────────────────────────────── */}
        {tab === "fees" && (
          <div>
            <h2 className="text-lg font-bold mb-1">Amazon Fee Analysis</h2>
            {summary?.feeBreakdown && Object.keys(summary.feeBreakdown).length > 0 ? (
              <>
                <p className="text-sm text-gray-500 mb-4">
                  Total fees: {fmt(Math.abs(summary.totalFees))} ({summary.grossIncome ? fmtPct(Math.abs(summary.totalFees / summary.grossIncome)) : "0%"} of gross)
                </p>
                <div className="space-y-2">
                  {Object.entries(summary.feeBreakdown)
                    .sort((a: any, b: any) => a[1] - b[1])
                    .map(([key, val]: [string, any]) => {
                      const maxFee = Math.max(...Object.values(summary.feeBreakdown).map((v: any) => Math.abs(v)));
                      return (
                        <div key={key} className="bg-[#111827] border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                          <div className="flex-1">
                            <div className="text-sm font-medium capitalize mb-2">{(key || "other").replace(/_/g, " ")}</div>
                            <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                              <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${(Math.abs(val) / maxFee) * 100}%` }} />
                            </div>
                          </div>
                          <div className="text-right min-w-[100px]">
                            <div className="text-base font-bold font-mono text-red-400">{fmt(Math.abs(val))}</div>
                            <div className="text-xs text-gray-500">{summary.totalFees ? fmtPct(Math.abs(val / summary.totalFees)) : "0%"} of fees</div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-gray-500">Upload a settlement report to see fee analysis.</div>
            )}
          </div>
        )}

        {/* ── BANKING TAB (Upload + Transaction Review) ── */}
        {tab === "banking" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-bold">Bank & Credit Card Transactions</h2>
                <p className="text-sm text-gray-500">Upload CSV statements, tag business vs personal, auto-categorize</p>
              </div>
            </div>

            {/* Bank upload */}
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 mb-4">
              <label className="block border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-lg p-6 text-center cursor-pointer transition">
                <Landmark size={24} className="mx-auto mb-2 text-gray-500" />
                <div className="text-sm font-medium mb-1">Upload bank or credit card CSV</div>
                <div className="text-xs text-gray-500">Supports Chase, Bank of America, Wells Fargo, Capital One, and generic CSV</div>
                <input type="file" accept=".csv,.tsv,.txt" onChange={handleBankUpload} className="hidden" disabled={bankUploading} />
              </label>
              {bankMsg && <div className={`mt-2 text-sm text-center ${bankMsg.startsWith("Error") ? "text-red-400" : bankMsg.startsWith("Done") ? "text-emerald-400" : "text-indigo-400"}`}>{bankMsg}</div>}
            </div>

            {/* Stats bar */}
            {bankTxns.length > 0 && (
              <div className="flex gap-2 mb-4">
                {([
                  { key: "all" as const, label: `All (${bankStats.total})`, color: "" },
                  { key: "unreviewed" as const, label: `Needs review (${bankStats.unreviewed})`, color: "text-amber-400" },
                  { key: "business" as const, label: `Business (${bankStats.business})`, color: "text-emerald-400" },
                  { key: "personal" as const, label: `Personal (${bankStats.personal})`, color: "text-red-400" },
                ]).map(f => (
                  <button key={f.key} onClick={() => setBankFilter(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${bankFilter === f.key ? "bg-indigo-600 text-white" : `bg-gray-800 ${f.color || "text-gray-400"} hover:bg-gray-700`}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {/* Transaction list */}
            {filteredBankTxns.length > 0 ? (
              <div className="space-y-1">
                {filteredBankTxns.map((tx: any) => (
                  <div key={tx.id} className={`bg-[#111827] border rounded-xl px-4 py-3 flex items-center gap-3 ${
                    tx.is_business === null ? "border-amber-800/30" : tx.is_business ? "border-gray-800" : "border-gray-800 opacity-50"
                  }`}>
                    {/* Date */}
                    <div className="text-xs font-mono text-gray-500 w-16 shrink-0">{tx.date?.slice(5)}</div>

                    {/* Description + AI suggestion */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{tx.description}</div>
                      <div className="text-xs text-gray-500">
                        {tx.ai_category_suggestion ? (
                          <span className="text-indigo-400">{tx.ai_category_suggestion}</span>
                        ) : (
                          <span className="text-gray-600 italic">No category match</span>
                        )}
                        {tx.bank_imports?.account_name && <span className="ml-2 text-gray-600">· {tx.bank_imports.account_name}</span>}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className={`text-sm font-mono font-semibold w-24 text-right shrink-0 ${Number(tx.amount) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmt(Number(tx.amount))}
                    </div>

                    {/* Tag buttons */}
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => tagTransaction(tx.id, true)}
                        className={`px-2 py-1 rounded text-xs font-medium transition ${tx.is_business === true ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-emerald-900 hover:text-emerald-400"}`}
                        title="Business">
                        <CheckCircle size={14} />
                      </button>
                      <button onClick={() => tagTransaction(tx.id, false)}
                        className={`px-2 py-1 rounded text-xs font-medium transition ${tx.is_business === false ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-red-900 hover:text-red-400"}`}
                        title="Personal">
                        <XCircle size={14} />
                      </button>
                      <button onClick={() => {
                        const pct = prompt("Business percentage (e.g. 60 for 60%):");
                        if (pct) tagTransaction(tx.id, true, Number(tx.amount) * (Number(pct) / 100));
                      }}
                        className="px-2 py-1 rounded text-xs font-medium bg-gray-800 text-gray-400 hover:bg-amber-900 hover:text-amber-400 transition"
                        title="Split (partial business)">
                        <Split size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500 text-sm">
                {bankTxns.length === 0 ? "Upload a bank or credit card CSV to start reviewing transactions." : "No transactions match this filter."}
              </div>
            )}
          </div>
        )}

        {/* ── RECONCILIATION TAB ─────────────────────── */}
        {tab === "reconcile" && (
          <div>
            {/* Date Range Picker */}
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-500 font-medium">DATE RANGE:</span>
                <input type="date" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                <span className="text-gray-600">to</span>
                <input type="date" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                <button onClick={() => loadReconciliation()} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-medium transition">Apply</button>
                <div className="flex gap-1 ml-2">
                  {[
                    { label: "Full Year", from: "2025-01-01", to: "2025-12-31" },
                    { label: "Q1", from: "2025-01-01", to: "2025-03-31" },
                    { label: "Q2", from: "2025-04-01", to: "2025-06-30" },
                    { label: "Q3", from: "2025-07-01", to: "2025-09-30" },
                    { label: "Q4", from: "2025-10-01", to: "2025-12-31" },
                  ].map(p => (
                    <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to); loadReconciliation(p.from, p.to); }}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition ${dateFrom === p.from && dateTo === p.to ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>{p.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <h2 className="text-lg font-bold mb-1">Bank Reconciliation</h2>
            <p className="text-sm text-gray-500 mb-6">{dateFrom} to {dateTo} — Accrual vs cash basis</p>

            {reconData && reconData.length > 0 ? (
              <div className="space-y-3">
                {/* Accrual vs Cash chart */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 mb-4">
                  <div className="text-sm font-semibold mb-4">Monthly: accrual income vs cash deposits</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={[...reconData].reverse()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v: string) => v?.slice(5, 7) + '/' + v?.slice(2, 4)} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 13 }} />
                      <Bar dataKey="accrual_net" fill="#818cf8" radius={[4, 4, 0, 0]} name="Accrual (when sold)" />
                      <Bar dataKey="cash_deposits" fill="#10b981" radius={[4, 4, 0, 0]} name="Cash (when deposited)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Monthly detail */}
                {reconData.map((row: any, i: number) => {
                  const diff = Number(row.timing_difference);
                  const status = row.reconciliation_status;
                  return (
                    <div key={i} className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                      <div className="flex justify-between items-center mb-3">
                        <div className="text-sm font-semibold">{new Date(row.month + 'T12:00:00').toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          status === "matched" ? "bg-emerald-900/30 text-emerald-400" :
                          status === "timing_gap" ? "bg-amber-900/30 text-amber-400" :
                          "bg-gray-800 text-gray-400"
                        }`}>
                          {status === "matched" ? "Reconciled" : status === "timing_gap" ? "Timing gap" : status}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Accrual income</div>
                          <div className="text-sm font-mono font-semibold text-indigo-400">{fmt(Number(row.accrual_net))}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Cash deposited</div>
                          <div className="text-sm font-mono font-semibold text-emerald-400">{fmt(Number(row.cash_deposits))}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Timing difference</div>
                          <div className={`text-sm font-mono font-semibold ${Math.abs(diff) < 1 ? "text-emerald-400" : "text-amber-400"}`}>
                            {fmt(diff)}
                          </div>
                        </div>
                      </div>
                      {Math.abs(diff) > 1 && (
                        <div className="mt-3 px-3 py-2 bg-indigo-500/5 border border-indigo-500/20 rounded-lg text-xs text-gray-400">
                          Adjusting entry: DR Accounts Receivable {fmt(Math.abs(diff))} / CR Revenue {fmt(Math.abs(diff))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500 text-sm">
                Upload settlement reports and bank statements to see reconciliation. The system matches Amazon deposits to bank transactions automatically.
              </div>
            )}
          </div>
        )}

        {/* ── BALANCE SHEET TAB ──────────────────────── */}
        {tab === "balance" && (
          <div>
            {/* Date Range Picker */}
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-500 font-medium">AS OF DATE:</span>
                <input type="date" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                <span className="text-gray-600">to</span>
                <input type="date" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                <button onClick={() => loadBalanceSheet()} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-medium transition">Apply</button>
                <div className="flex gap-1 ml-2">
                  {[
                    { label: "Full Year", from: "2025-01-01", to: "2025-12-31" },
                    { label: "Q1", from: "2025-01-01", to: "2025-03-31" },
                    { label: "Q2", from: "2025-04-01", to: "2025-06-30" },
                    { label: "Q3", from: "2025-07-01", to: "2025-09-30" },
                    { label: "Q4", from: "2025-10-01", to: "2025-12-31" },
                  ].map(p => (
                    <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to); loadBalanceSheet(p.from, p.to); }}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition ${dateFrom === p.from && dateTo === p.to ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>{p.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <h2 className="text-lg font-bold mb-1">Balance Sheet</h2>
            <p className="text-sm text-gray-500 mb-6">Period: {dateFrom} to {dateTo}</p>

            {balanceSheet ? (
              <div className="space-y-6">
                {/* ASSETS */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                  <div className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-4">Assets</div>

                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-2">Current assets</div>
                  <div className="space-y-2 ml-2">
                    {[
                      { label: "Cash — Amazon deposits", value: Number(balanceSheet.cash_amazon_deposits) },
                      { label: "Cash — Bank balance", value: Number(balanceSheet.cash_bank_balance) },
                      { label: "Inventory on hand", value: Number(balanceSheet.inventory_on_hand) },
                    ].map((item) => (
                      <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-gray-800/50">
                        <span className="text-sm text-gray-300">{item.label}</span>
                        <span className="text-sm font-mono text-gray-200">{fmt(item.value)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-5">Fixed assets</div>
                  <div className="space-y-2 ml-2">
                    {[
                      { label: "Property & equipment (gross)", value: Number(balanceSheet.fixed_assets_gross) },
                      { label: "Less: accumulated depreciation", value: -Number(balanceSheet.accumulated_depreciation) },
                      { label: "Property & equipment (net)", value: Number(balanceSheet.fixed_assets_net) },
                    ].map((item) => (
                      <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-gray-800/50">
                        <span className={`text-sm ${item.label.includes("Less:") ? "text-gray-500 italic" : "text-gray-300"}`}>{item.label}</span>
                        <span className={`text-sm font-mono ${item.value < 0 ? "text-red-400" : "text-gray-200"}`}>{fmt(item.value)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center mt-4 pt-3 border-t-2 border-emerald-800">
                    <span className="text-sm font-bold text-emerald-400">TOTAL ASSETS</span>
                    <span className="text-lg font-bold font-mono text-emerald-400">{fmt(Number(balanceSheet.total_assets))}</span>
                  </div>
                </div>

                {/* LIABILITIES */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                  <div className="text-sm font-bold text-red-400 uppercase tracking-wider mb-4">Liabilities</div>
                  <div className="space-y-2 ml-2">
                    <div className="flex justify-between items-center py-1.5 border-b border-gray-800/50">
                      <span className="text-sm text-gray-300">Accounts payable / expenses</span>
                      <span className="text-sm font-mono text-gray-200">{fmt(Number(balanceSheet.total_liabilities))}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-4 pt-3 border-t-2 border-red-800">
                    <span className="text-sm font-bold text-red-400">TOTAL LIABILITIES</span>
                    <span className="text-lg font-bold font-mono text-red-400">{fmt(Number(balanceSheet.total_liabilities))}</span>
                  </div>
                </div>

                {/* EQUITY */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                  <div className="text-sm font-bold text-indigo-400 uppercase tracking-wider mb-4">Owner&apos;s Equity</div>
                  <div className="space-y-2 ml-2">
                    {[
                      { label: "Retained earnings — Amazon", value: Number(balanceSheet.retained_earnings_amazon) },
                      { label: "Retained earnings — Other income", value: Number(balanceSheet.retained_earnings_other) },
                      { label: "Less: total expenses", value: -Number(balanceSheet.total_liabilities) },
                    ].map((item) => (
                      <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-gray-800/50">
                        <span className={`text-sm ${item.label.includes("Less:") ? "text-gray-500 italic" : "text-gray-300"}`}>{item.label}</span>
                        <span className={`text-sm font-mono ${item.value < 0 ? "text-red-400" : "text-gray-200"}`}>{fmt(item.value)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-4 pt-3 border-t-2 border-indigo-800">
                    <span className="text-sm font-bold text-indigo-400">TOTAL OWNER&apos;S EQUITY</span>
                    <span className="text-lg font-bold font-mono text-indigo-400">{fmt(Number(balanceSheet.owners_equity))}</span>
                  </div>
                </div>

                {/* ACCOUNTING EQUATION CHECK */}
                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4">
                  <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">Accounting equation check</div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Assets</div>
                      <div className="text-base font-bold font-mono text-emerald-400">{fmt(Number(balanceSheet.total_assets))}</div>
                    </div>
                    <div className="flex items-center justify-center text-gray-500 text-lg">=</div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Liabilities + Equity</div>
                      <div className="text-base font-bold font-mono text-indigo-400">
                        {fmt(Number(balanceSheet.total_liabilities) + Number(balanceSheet.owners_equity))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500">Upload a settlement report and add expenses to generate your balance sheet.</div>
            )}

            {/* ── INVENTORY MANAGEMENT ── */}
            <div className="mt-6">
              <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">Inventory Management</div>
                    <p className="text-xs text-gray-500 mt-1">Upload Amazon inventory report or set values manually</p>
                  </div>
                  {invSummary && (
                    <div className="text-right text-xs text-gray-400">
                      <div>{invSummary.uniqueSkus} SKUs · {invSummary.totalUnits?.toLocaleString()} units</div>
                      <div className="font-mono text-amber-400">{fmt(invSummary.totalValue)}</div>
                    </div>
                  )}
                </div>

                {/* Upload inventory report */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block border border-dashed border-gray-700 hover:border-amber-500 rounded-lg p-4 text-center cursor-pointer transition">
                      <Upload size={20} className="mx-auto mb-2 text-gray-500" />
                      <div className="text-xs font-medium">Upload Inventory Report</div>
                      <div className="text-[10px] text-gray-600 mt-1">Event Detail, Manage Inventory, or Ledger Summary (CSV/TSV)</div>
                      <input type="file" accept=".csv,.tsv,.txt" onChange={handleInventoryUpload} className="hidden" disabled={invUploading} />
                    </label>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-gray-500">Default Cost Per Unit ($)</label>
                      <input type="number" step="0.01" className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm mt-1" value={defaultCost} onChange={e => setDefaultCost(e.target.value)} />
                      <p className="text-[10px] text-gray-600 mt-1">Used for SKUs without a set cost. Booksellers: $3-7 avg. Private label: set per SKU below.</p>
                    </div>
                  </div>
                </div>

                {invMsg && (
                  <div className={`text-xs text-center py-2 rounded ${invMsg.startsWith("Error") ? "text-red-400 bg-red-900/20" : invMsg.startsWith("Done") ? "text-emerald-400 bg-emerald-900/20" : "text-indigo-400"}`}>{invMsg}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── EXPENSES TAB ───────────────────────────── */}
        {tab === "expenses" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-bold">Business Expenses</h2>
                <p className="text-sm text-gray-500">Total: {fmt(totalExpenses)} · {expenses.length} entries</p>
              </div>
            </div>

            {/* Add expense form */}
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 mb-4">
              <div className="text-sm font-semibold mb-3">Add Expense</div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date</label>
                  <input type="date" value={newExp.date} onChange={(e) => setNewExp((p) => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Category</label>
                  <select value={newExp.category} onChange={(e) => setNewExp((p) => ({ ...p, category: e.target.value }))}>
                    {EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Amount</label>
                  <input type="number" step="0.01" placeholder="0.00" value={newExp.amount} onChange={(e) => setNewExp((p) => ({ ...p, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Vendor</label>
                  <input type="text" placeholder="e.g. Uline" value={newExp.vendor} onChange={(e) => setNewExp((p) => ({ ...p, vendor: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Description</label>
                  <input type="text" placeholder="What for?" value={newExp.description} onChange={(e) => setNewExp((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <button onClick={addExpense} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition h-[38px]">
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Expense list */}
            <div className="space-y-1.5">
              {expenses.map((e: any) => (
                <div key={e.id} className="bg-[#111827] border border-gray-800 rounded-xl px-4 py-3 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="text-xs font-mono text-gray-500 w-16">{e.date?.slice(5)}</div>
                    <div>
                      <div className="text-sm font-medium">{e.description || e.expense_categories?.name || "Expense"}</div>
                      <div className="text-xs text-gray-500">{e.expense_categories?.name} {e.vendor ? `· ${e.vendor}` : ""}</div>
                    </div>
                  </div>
                  <div className="text-sm font-bold font-mono text-red-400">-{fmt(Number(e.amount))}</div>
                </div>
              ))}
              {expenses.length === 0 && (
                <div className="text-center py-12 text-gray-500 text-sm">No expenses yet. Add your first one above.</div>
              )}
            </div>
          </div>
        )}

        {/* ── CHART OF ACCOUNTS TAB ──────────────────── */}
        {tab === "coa" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-bold">Chart of Accounts</h2>
                <p className="text-sm text-gray-500">{coaAccounts.length} accounts · Beginning balances and trial balance</p>
              </div>
            </div>

            {/* Add/Edit form */}
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 mb-4">
              <div className="text-xs font-bold text-gray-400 uppercase mb-3">{coaEditId ? "Edit Account" : "Add New Account"}</div>
              <div className="grid grid-cols-6 gap-2">
                <input placeholder="Acct #" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm" value={coaForm.account_number} onChange={e => setCoaForm(p => ({ ...p, account_number: e.target.value }))} />
                <input placeholder="Account Name" className="col-span-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm" value={coaForm.account_name} onChange={e => setCoaForm(p => ({ ...p, account_name: e.target.value }))} />
                <select className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm" value={coaForm.account_type} onChange={e => setCoaForm(p => ({ ...p, account_type: e.target.value }))}>
                  <option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="income">Income</option><option value="expense">Expense</option>
                </select>
                <input placeholder="Beg. Balance" type="number" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm" value={coaForm.beginning_balance} onChange={e => setCoaForm(p => ({ ...p, beginning_balance: e.target.value }))} />
                <button onClick={saveCOAAccount} className="bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition">{coaEditId ? "Update" : "Add"}</button>
              </div>
            </div>

            {/* Account list grouped by type */}
            {["asset", "liability", "equity", "income", "expense"].map(type => {
              const accts = coaAccounts.filter((a: any) => a.account_type === type);
              if (accts.length === 0) return null;
              const typeColors: any = { asset: "text-blue-400", liability: "text-red-400", equity: "text-purple-400", income: "text-emerald-400", expense: "text-orange-400" };
              return (
                <div key={type} className="mb-4">
                  <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${typeColors[type]}`}>{type}s</div>
                  <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden">
                    {accts.map((acct: any) => (
                      <div key={acct.id} className="flex items-center px-4 py-2 border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                        <span className="text-xs font-mono text-gray-500 w-16">{acct.account_number}</span>
                        <span className="text-sm flex-1">{acct.account_name}</span>
                        <span className="text-xs text-gray-500 w-24 text-right">{acct.beginning_balance ? fmt(Number(acct.beginning_balance)) : "—"}</span>
                        <button onClick={() => { setCoaEditId(acct.id); setCoaForm({ account_number: acct.account_number, account_name: acct.account_name, account_type: acct.account_type, description: acct.description || "", beginning_balance: String(acct.beginning_balance || 0) }); }}
                          className="ml-3 text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Trial Balance */}
            {trialBalance.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider mb-3">Trial Balance</h3>
                <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-5 gap-0 px-4 py-2 border-b border-gray-700 text-xs font-bold text-gray-500">
                    <span>Account</span><span>Name</span><span className="text-right">Debits</span><span className="text-right">Credits</span><span className="text-right">Balance</span>
                  </div>
                  {trialBalance.filter((r: any) => Number(r.total_debits) !== 0 || Number(r.total_credits) !== 0 || Number(r.beginning_balance) !== 0).map((row: any) => (
                    <div key={row.id} className="grid grid-cols-5 gap-0 px-4 py-1.5 border-b border-gray-800/30 text-xs">
                      <span className="font-mono text-gray-500">{row.account_number}</span>
                      <span className="text-gray-300">{row.account_name}</span>
                      <span className="text-right font-mono text-gray-300">{Number(row.total_debits) > 0 ? fmt(Number(row.total_debits)) : "—"}</span>
                      <span className="text-right font-mono text-gray-300">{Number(row.total_credits) > 0 ? fmt(Number(row.total_credits)) : "—"}</span>
                      <span className={`text-right font-mono font-semibold ${Number(row.ending_balance) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(Number(row.ending_balance))}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-5 gap-0 px-4 py-2 border-t-2 border-gray-700 text-xs font-bold">
                    <span></span><span className="text-cyan-400">TOTALS</span>
                    <span className="text-right font-mono text-cyan-400">{fmt(trialBalance.reduce((s: number, r: any) => s + Number(r.total_debits), 0))}</span>
                    <span className="text-right font-mono text-cyan-400">{fmt(trialBalance.reduce((s: number, r: any) => s + Number(r.total_credits), 0))}</span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── JOURNAL ENTRIES TAB ────────────────────── */}
        {tab === "journal" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-bold">Journal Entries</h2>
                <p className="text-sm text-gray-500">{journalEntries.length} entries</p>
              </div>
              <button onClick={() => setShowJEForm(!showJEForm)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition">
                <Plus size={14} className="inline mr-1" />{showJEForm ? "Cancel" : "New Entry"}
              </button>
            </div>

            {/* New JE form */}
            {showJEForm && (
              <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 mb-4">
                <div className="text-xs font-bold text-indigo-400 uppercase mb-3">New Journal Entry</div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div>
                    <label className="text-xs text-gray-500">Date</label>
                    <input type="date" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1" value={jeForm.date} onChange={e => setJeForm(p => ({ ...p, date: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500">Memo</label>
                    <input className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1" placeholder="Description of entry" value={jeForm.memo} onChange={e => setJeForm(p => ({ ...p, memo: e.target.value }))} />
                  </div>
                </div>
                <label className="flex items-center gap-2 mb-4 text-sm text-gray-400">
                  <input type="checkbox" checked={jeForm.is_opening_balance} onChange={e => setJeForm(p => ({ ...p, is_opening_balance: e.target.checked }))} />
                  Opening balance entry
                </label>

                {/* Line items */}
                <div className="space-y-2 mb-3">
                  <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 px-1">
                    <span className="col-span-5">Account</span><span className="col-span-2">Debit</span><span className="col-span-2">Credit</span><span className="col-span-3">Line Memo</span>
                  </div>
                  {jeForm.lines.map((line, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2">
                      <select className="col-span-5 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs"
                        value={line.account_id} onChange={e => { const lines = [...jeForm.lines]; lines[i].account_id = e.target.value; setJeForm(p => ({ ...p, lines })); }}>
                        <option value="">Select account...</option>
                        {coaAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.account_number} — {a.account_name}</option>)}
                      </select>
                      <input type="number" placeholder="0.00" className="col-span-2 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-right"
                        value={line.debit} onChange={e => { const lines = [...jeForm.lines]; lines[i].debit = e.target.value; if (e.target.value) lines[i].credit = ""; setJeForm(p => ({ ...p, lines })); }} />
                      <input type="number" placeholder="0.00" className="col-span-2 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-right"
                        value={line.credit} onChange={e => { const lines = [...jeForm.lines]; lines[i].credit = e.target.value; if (e.target.value) lines[i].debit = ""; setJeForm(p => ({ ...p, lines })); }} />
                      <input placeholder="memo" className="col-span-3 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs"
                        value={line.memo} onChange={e => { const lines = [...jeForm.lines]; lines[i].memo = e.target.value; setJeForm(p => ({ ...p, lines })); }} />
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center">
                  <button onClick={addJELine} className="text-xs text-indigo-400 hover:text-indigo-300">+ Add Line</button>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500">
                      DR: {fmt(jeForm.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0))} | CR: {fmt(jeForm.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0))}
                      {Math.abs(jeForm.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0) - jeForm.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)) < 0.01
                        ? <span className="text-emerald-400 ml-2">Balanced</span>
                        : <span className="text-red-400 ml-2">Not balanced</span>}
                    </span>
                    <button onClick={saveJournalEntry} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition">Post Entry</button>
                  </div>
                </div>
              </div>
            )}

            {/* Entry list */}
            {journalEntries.length > 0 ? (
              <div className="space-y-2">
                {journalEntries.map((je: any) => (
                  <div key={je.id} className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-gray-500">{je.entry_date}</span>
                        <span className="text-xs font-mono text-gray-600">#{je.entry_number}</span>
                        {je.is_opening_balance && <span className="text-[10px] bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded">Opening Balance</span>}
                        {je.is_adjusting && <span className="text-[10px] bg-amber-900/30 text-amber-400 px-2 py-0.5 rounded">Adjusting</span>}
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${je.status === 'posted' ? 'bg-emerald-900/30 text-emerald-400' : je.status === 'void' ? 'bg-red-900/30 text-red-400' : 'bg-gray-800 text-gray-400'}`}>{je.status}</span>
                    </div>
                    {je.memo && <div className="text-sm text-gray-400 mb-2">{je.memo}</div>}
                    <div className="space-y-1">
                      {je.journal_entry_lines?.map((line: any, i: number) => (
                        <div key={i} className="flex items-center text-xs">
                          <span className={`w-6 ${Number(line.credit) > 0 ? "ml-4" : ""}`}></span>
                          <span className="font-mono text-gray-500 w-12">{line.chart_of_accounts?.account_number}</span>
                          <span className="flex-1 text-gray-300">{line.chart_of_accounts?.account_name}</span>
                          <span className="w-24 text-right font-mono text-gray-300">{Number(line.debit) > 0 ? fmt(Number(line.debit)) : ""}</span>
                          <span className="w-24 text-right font-mono text-gray-300">{Number(line.credit) > 0 ? fmt(Number(line.credit)) : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500 text-sm">No journal entries yet. Click "New Entry" to create one.</div>
            )}
          </div>
        )}

        {/* ── INVENTORY TAB ──────────────────────────── */}
        {tab === "inventory" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-bold">Inventory & Purchases</h2>
                <p className="text-sm text-gray-500">{invItems.length} items tracked · {batches.length} purchase batches</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowBatchForm(!showBatchForm)} className="px-3 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-medium transition">
                  <Plus size={12} className="inline mr-1" />Add Batch
                </button>
                <button onClick={() => setShowInvForm(!showInvForm)} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-medium transition">
                  <Plus size={12} className="inline mr-1" />Add Item
                </button>
              </div>
            </div>

            {/* Purchase batch form */}
            {showBatchForm && (
              <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 mb-4">
                <div className="text-xs font-bold text-amber-400 uppercase mb-3">New Purchase Batch (Sourcing Trip)</div>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div><label className="text-[10px] text-gray-500">Date</label><input type="date" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={batchForm.batch_date} onChange={e => setBatchForm(p => ({...p, batch_date: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">Source Type</label>
                    <select className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={batchForm.source_type} onChange={e => setBatchForm(p => ({...p, source_type: e.target.value}))}>
                      <option value="thrift">Thrift Store</option><option value="wholesale">Wholesale</option><option value="online">Online Arbitrage</option><option value="library_sale">Library Sale</option><option value="garage_sale">Garage Sale</option><option value="retail">Retail Arbitrage</option>
                    </select></div>
                  <div><label className="text-[10px] text-gray-500">Store Name</label><input className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="e.g., Goodwill Henderson" value={batchForm.source_name} onChange={e => setBatchForm(p => ({...p, source_name: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">Payment</label>
                    <select className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={batchForm.payment_method} onChange={e => setBatchForm(p => ({...p, payment_method: e.target.value}))}>
                      <option value="credit_card">Credit Card</option><option value="debit">Debit Card</option><option value="cash">Cash</option>
                    </select></div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div><label className="text-[10px] text-gray-500">Total Cost ($)</label><input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="125.00" value={batchForm.total_cost} onChange={e => setBatchForm(p => ({...p, total_cost: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500"># Items</label><input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="25" value={batchForm.item_count} onChange={e => setBatchForm(p => ({...p, item_count: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">Notes</label><input className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="Optional" value={batchForm.notes} onChange={e => setBatchForm(p => ({...p, notes: e.target.value}))} /></div>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">{batchForm.total_cost && batchForm.item_count ? `Avg cost: $${(parseFloat(batchForm.total_cost) / parseInt(batchForm.item_count)).toFixed(2)}/item` : ""}</span>
                  <button onClick={saveBatch} className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-medium">Save Batch</button>
                </div>
              </div>
            )}

            {/* Add item form */}
            {showInvForm && (
              <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 mb-4">
                <div className="text-xs font-bold text-indigo-400 uppercase mb-3">Add Inventory Item</div>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div><label className="text-[10px] text-gray-500">SKU</label><input className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={invItemForm.sku} onChange={e => setInvItemForm(p => ({...p, sku: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">ASIN</label><input className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={invItemForm.asin} onChange={e => setInvItemForm(p => ({...p, asin: e.target.value}))} /></div>
                  <div className="col-span-2"><label className="text-[10px] text-gray-500">Title</label><input className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={invItemForm.title} onChange={e => setInvItemForm(p => ({...p, title: e.target.value}))} /></div>
                </div>
                <div className="grid grid-cols-5 gap-3 mb-3">
                  <div><label className="text-[10px] text-gray-500">Purchase Date</label><input type="date" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={invItemForm.purchase_date} onChange={e => setInvItemForm(p => ({...p, purchase_date: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">Cost ($)</label><input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="5.00" value={invItemForm.purchase_price} onChange={e => setInvItemForm(p => ({...p, purchase_price: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">Qty</label><input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={invItemForm.quantity_purchased} onChange={e => setInvItemForm(p => ({...p, quantity_purchased: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">Source</label><input className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="Goodwill" value={invItemForm.source_name} onChange={e => setInvItemForm(p => ({...p, source_name: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">List Price ($)</label><input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="19.99" value={invItemForm.list_price} onChange={e => setInvItemForm(p => ({...p, list_price: e.target.value}))} /></div>
                </div>
                <div className="flex justify-end"><button onClick={saveInvItem} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-medium">Save Item</button></div>
              </div>
            )}

            {/* Purchase batch list */}
            {batches.length > 0 && (
              <div className="mb-6">
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">Purchase Batches</div>
                <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden">
                  {batches.map((b: any) => (
                    <div key={b.id} className="flex items-center px-4 py-2.5 border-b border-gray-800/50 hover:bg-gray-800/30">
                      <span className="text-xs font-mono text-gray-500 w-24">{b.batch_date}</span>
                      <span className="text-sm flex-1">{b.source_name || b.source_type}</span>
                      <span className="text-xs text-gray-500 w-16 text-right">{b.item_count} items</span>
                      <span className="text-sm font-mono font-semibold text-amber-400 w-24 text-right">{fmt(Number(b.total_cost))}</span>
                      <span className="text-[10px] text-gray-600 w-20 text-right">{b.payment_method}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inventory items list */}
            {invItems.length > 0 && (
              <div>
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Inventory Items</div>
                <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-8 gap-0 px-4 py-2 border-b border-gray-700 text-[10px] font-bold text-gray-500">
                    <span>Date</span><span className="col-span-2">Title</span><span>SKU</span><span>Cost</span><span>List</span><span>Source</span><span>Status</span>
                  </div>
                  {invItems.slice(0, 50).map((item: any) => (
                    <div key={item.id} className="grid grid-cols-8 gap-0 px-4 py-1.5 border-b border-gray-800/30 text-xs">
                      <span className="font-mono text-gray-500">{item.purchase_date?.slice(5)}</span>
                      <span className="col-span-2 text-gray-300 truncate">{item.title}</span>
                      <span className="font-mono text-indigo-400 truncate">{item.sku}</span>
                      <span className="font-mono">{fmt(Number(item.purchase_price))}</span>
                      <span className="font-mono text-gray-400">{item.list_price ? fmt(Number(item.list_price)) : "—"}</span>
                      <span className="text-gray-500 truncate">{item.source_name || item.source}</span>
                      <span className={`text-[10px] ${item.status === 'sold' ? 'text-emerald-400' : item.status === 'at_fba' ? 'text-blue-400' : 'text-gray-500'}`}>{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {invItems.length === 0 && batches.length === 0 && !showInvForm && !showBatchForm && (
              <div className="text-center py-16 text-gray-500 text-sm">No inventory tracked yet. Click "Add Batch" for a sourcing trip, or "Add Item" for individual products.</div>
            )}
          </div>
        )}

        {/* ── PURCHASES TAB ───────────────────────────── */}
        {tab === "purchases" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-bold">Purchase Tracking</h2>
                <p className="text-sm text-gray-500">Track sourcing trips and purchases for COGS calculation</p>
              </div>
              <button onClick={() => setShowPoForm(!showPoForm)} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition">
                <Plus size={14} className="inline mr-1" />{showPoForm ? "Cancel" : "Log Purchase"}
              </button>
            </div>

            {/* Summary cards */}
            {purchases.length > 0 && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                <MetricCard label="TOTAL TRIPS" value={String(purchases.length)} color="text-amber-400" />
                <MetricCard label="TOTAL SPENT" value={fmt(purchases.reduce((s: number, p: any) => s + Number(p.total), 0))} color="text-red-400" />
                <MetricCard label="AVG PER TRIP" value={fmt(purchases.reduce((s: number, p: any) => s + Number(p.total), 0) / (purchases.length || 1))} color="text-indigo-400" />
                <MetricCard label="THIS MONTH" value={fmt(purchases.filter((p: any) => p.purchase_date?.startsWith(new Date().toISOString().slice(0, 7))).reduce((s: number, p: any) => s + Number(p.total), 0))} color="text-emerald-400" />
              </div>
            )}

            {/* Add purchase form */}
            {showPoForm && (
              <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 mb-4">
                <div className="text-xs font-bold text-amber-400 uppercase mb-3">New Purchase / Sourcing Trip</div>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div><label className="text-[10px] text-gray-500">Date</label><input type="date" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={poForm.purchase_date} onChange={e => setPoForm(p => ({...p, purchase_date: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">Vendor / Store</label><input className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="Goodwill Henderson" value={poForm.vendor} onChange={e => setPoForm(p => ({...p, vendor: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">Source Type</label>
                    <select className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={poForm.source_type} onChange={e => setPoForm(p => ({...p, source_type: e.target.value}))}>
                      <option value="thrift">Thrift Store</option><option value="library">Library Sale</option><option value="wholesale">Wholesale</option><option value="online_arbitrage">Online Arbitrage</option><option value="retail_arbitrage">Retail Arbitrage</option><option value="liquidation">Liquidation</option><option value="other">Other</option>
                    </select></div>
                  <div><label className="text-[10px] text-gray-500">Payment Method</label>
                    <select className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={poForm.payment_method} onChange={e => setPoForm(p => ({...p, payment_method: e.target.value}))}>
                      <option value="credit_card">Credit Card</option><option value="debit">Debit Card</option><option value="cash">Cash</option><option value="check">Check</option>
                    </select></div>
                </div>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div><label className="text-[10px] text-gray-500">Subtotal ($)</label><input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="100.00" value={poForm.subtotal} onChange={e => setPoForm(p => ({...p, subtotal: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">Tax ($)</label><input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="8.25" value={poForm.tax} onChange={e => setPoForm(p => ({...p, tax: e.target.value}))} /></div>
                  <div className="col-span-2"><label className="text-[10px] text-gray-500">Notes</label><input className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="25 books, 3 games" value={poForm.notes} onChange={e => setPoForm(p => ({...p, notes: e.target.value}))} /></div>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Total: {fmt((parseFloat(poForm.subtotal) || 0) + (parseFloat(poForm.tax) || 0))}</span>
                  <button onClick={async () => {
                    if (!user || !poForm.vendor) return;
                    const total = (parseFloat(poForm.subtotal) || 0) + (parseFloat(poForm.tax) || 0);
                    await supabase.from("purchase_orders").insert({
                      user_id: user.id, vendor: poForm.vendor, purchase_date: poForm.purchase_date,
                      source_type: poForm.source_type, subtotal: parseFloat(poForm.subtotal) || 0,
                      tax: parseFloat(poForm.tax) || 0, total, payment_method: poForm.payment_method, notes: poForm.notes,
                    });
                    setShowPoForm(false);
                    setPoForm({ vendor: "", purchase_date: new Date().toISOString().slice(0, 10), source_type: "thrift", subtotal: "", tax: "", payment_method: "credit_card", notes: "" });
                    const { data } = await supabase.from("purchase_orders").select("*").eq("user_id", user.id).order("purchase_date", { ascending: false }).limit(100);
                    if (data) setPurchases(data);
                  }} className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-medium">Save Purchase</button>
                </div>
              </div>
            )}

            {/* Purchase list */}
            {purchases.length > 0 ? (
              <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden">
                <div className="grid grid-cols-7 gap-0 px-4 py-2 border-b border-gray-700 text-[10px] font-bold text-gray-500">
                  <span>Date</span><span>Vendor</span><span>Source</span><span className="text-right">Subtotal</span><span className="text-right">Tax</span><span className="text-right">Total</span><span>Payment</span>
                </div>
                {purchases.map((po: any) => (
                  <div key={po.id} className="grid grid-cols-7 gap-0 px-4 py-2 border-b border-gray-800/30 text-xs hover:bg-gray-800/20">
                    <span className="font-mono text-gray-500">{po.purchase_date}</span>
                    <span className="text-gray-300">{po.vendor}</span>
                    <span className="text-gray-500 capitalize">{po.source_type?.replace(/_/g, ' ')}</span>
                    <span className="text-right font-mono">{fmt(Number(po.subtotal))}</span>
                    <span className="text-right font-mono text-gray-500">{fmt(Number(po.tax))}</span>
                    <span className="text-right font-mono font-semibold text-amber-400">{fmt(Number(po.total))}</span>
                    <span className="text-gray-500 capitalize">{po.payment_method?.replace(/_/g, ' ')}</span>
                  </div>
                ))}
                <div className="grid grid-cols-7 gap-0 px-4 py-2 border-t-2 border-gray-700 text-xs font-bold">
                  <span></span><span className="text-amber-400">TOTALS</span><span></span>
                  <span className="text-right font-mono">{fmt(purchases.reduce((s: number, p: any) => s + Number(p.subtotal), 0))}</span>
                  <span className="text-right font-mono text-gray-500">{fmt(purchases.reduce((s: number, p: any) => s + Number(p.tax), 0))}</span>
                  <span className="text-right font-mono text-amber-400">{fmt(purchases.reduce((s: number, p: any) => s + Number(p.total), 0))}</span>
                  <span></span>
                </div>
              </div>
            ) : !showPoForm ? (
              <div className="text-center py-16 text-gray-500 text-sm">No purchases logged yet. Click "Log Purchase" to track sourcing trips, thrift store buys, and wholesale orders. These feed directly into your COGS calculation on the P&L.</div>
            ) : null}
          </div>
        )}

        {/* ── MILEAGE TAB ────────────────────────────── */}
        {tab === "mileage" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-bold">Mileage Tracker</h2>
                <p className="text-sm text-gray-500">
                  {mileageSummary ? `${mileageSummary.total_trips} trips · ${Number(mileageSummary.total_miles).toLocaleString()} miles · ${fmt(Number(mileageSummary.total_deduction))} deduction (${mileageSummary.irs_rate_used}/mi)` : "Track business mileage for Schedule C Line 9"}
                </p>
              </div>
              <button onClick={() => setShowMileageForm(!showMileageForm)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition">
                <Plus size={14} className="inline mr-1" />{showMileageForm ? "Cancel" : "Log Trip"}
              </button>
            </div>

            {/* Summary card */}
            {mileageSummary && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                <MetricCard label="TOTAL TRIPS" value={String(mileageSummary.total_trips)} color="text-indigo-400" />
                <MetricCard label="TOTAL MILES" value={Number(mileageSummary.total_miles).toLocaleString()} color="text-blue-400" />
                <MetricCard label="TAX DEDUCTION" value={fmt(Number(mileageSummary.total_deduction))} color="text-emerald-400" sub={`@ $${mileageSummary.irs_rate_used}/mile`} />
                <MetricCard label="IRS RATE (2025)" value="$0.70/mi" color="text-gray-400" sub="Schedule C Line 9" />
              </div>
            )}

            {/* Add mileage form */}
            {showMileageForm && (
              <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 mb-4">
                <div className="text-xs font-bold text-indigo-400 uppercase mb-3">Log Business Trip</div>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div><label className="text-[10px] text-gray-500">Date</label><input type="date" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={mileageForm.trip_date} onChange={e => setMileageForm(p => ({...p, trip_date: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">Purpose</label>
                    <select className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={mileageForm.purpose} onChange={e => setMileageForm(p => ({...p, purpose: e.target.value}))}>
                      <option value="sourcing">Sourcing Trip</option><option value="post_office">Post Office / Shipping</option><option value="supply_run">Supply Run</option><option value="meeting">Business Meeting</option><option value="fba_prep">FBA Prep Center</option><option value="other">Other Business</option>
                    </select></div>
                  <div><label className="text-[10px] text-gray-500">Miles (one way)</label><input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="12.5" value={mileageForm.miles} onChange={e => setMileageForm(p => ({...p, miles: e.target.value}))} /></div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-xs text-gray-400">
                      <input type="checkbox" checked={mileageForm.is_round_trip} onChange={e => setMileageForm(p => ({...p, is_round_trip: e.target.checked}))} />
                      Round trip (×2)
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div><label className="text-[10px] text-gray-500">From</label><input className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="Home" value={mileageForm.from_location} onChange={e => setMileageForm(p => ({...p, from_location: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">To</label><input className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" placeholder="Goodwill Henderson" value={mileageForm.to_location} onChange={e => setMileageForm(p => ({...p, to_location: e.target.value}))} /></div>
                  <div><label className="text-[10px] text-gray-500">Notes</label><input className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs mt-1" value={mileageForm.notes} onChange={e => setMileageForm(p => ({...p, notes: e.target.value}))} /></div>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">{mileageForm.miles ? `Deduction: ${fmt(parseFloat(mileageForm.miles) * (mileageForm.is_round_trip ? 2 : 1) * 0.70)}` : ""}</span>
                  <button onClick={saveMileage} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-medium">Save Trip</button>
                </div>
              </div>
            )}

            {/* Mileage log list */}
            {mileageLogs.length > 0 ? (
              <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden">
                <div className="grid grid-cols-7 gap-0 px-4 py-2 border-b border-gray-700 text-[10px] font-bold text-gray-500">
                  <span>Date</span><span>Purpose</span><span>From</span><span>To</span><span className="text-right">Miles</span><span className="text-right">Rate</span><span className="text-right">Deduction</span>
                </div>
                {mileageLogs.map((log: any) => (
                  <div key={log.id} className="grid grid-cols-7 gap-0 px-4 py-2 border-b border-gray-800/30 text-xs">
                    <span className="font-mono text-gray-500">{log.trip_date}</span>
                    <span className="text-gray-300 capitalize">{log.purpose?.replace(/_/g, ' ')}</span>
                    <span className="text-gray-500 truncate">{log.from_location || "—"}</span>
                    <span className="text-gray-500 truncate">{log.to_location || "—"}</span>
                    <span className="text-right font-mono">{Number(log.miles).toFixed(1)}{log.is_round_trip ? " (RT)" : ""}</span>
                    <span className="text-right font-mono text-gray-500">${log.irs_rate}</span>
                    <span className="text-right font-mono font-semibold text-emerald-400">{fmt(Number(log.miles) * Number(log.irs_rate))}</span>
                  </div>
                ))}
              </div>
            ) : !showMileageForm ? (
              <div className="text-center py-16 text-gray-500 text-sm">No mileage logged yet. Click "Log Trip" to start tracking business miles for your Schedule C deduction.</div>
            ) : null}
          </div>
        )}

        {/* ── ASK AI TAB ─────────────────────────────── */}
        {tab === "ask" && (
          <div>
            <h2 className="text-lg font-bold mb-4">Ask AI About Your Finances</h2>
            <div className="bg-[#111827] border border-gray-800 rounded-xl flex flex-col" style={{ height: 460 }}>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {aiMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user" ? "bg-indigo-600 text-white" : "bg-gray-800/50 border border-gray-800"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-800 p-3 flex gap-2">
                <input
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAiSend()}
                  placeholder="Ask about your Amazon finances..."
                  className="flex-1"
                />
                <button onClick={handleAiSend} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition">
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-4 text-center text-xs text-gray-600 mt-12">
        ShelfKeeper by ARJE · Need tax help? <span className="text-indigo-400 cursor-pointer">Connect with ARJE Tax Services</span>
      </footer>
    </div>
  );
}
