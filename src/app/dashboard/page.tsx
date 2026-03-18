"use client";
import { useState, useCallback, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { parseSettlementReport } from "@/lib/settlement-parser";

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

  const loadBalanceSheet = async () => {
    const { data } = await supabase.from("v_balance_sheet").select("*").limit(1);
    if (data && data.length > 0) setBalanceSheet(data[0]);
  };

  const loadBankTransactions = async () => {
    const { data } = await supabase
      .from("bank_transactions")
      .select("*, bank_imports(account_name, account_type)")
      .order("date", { ascending: false })
      .limit(500);
    if (data) setBankTxns(data);
  };

  const loadReconciliation = async () => {
    const { data } = await supabase.from("v_accrual_vs_cash").select("*").order("month", { ascending: false }).limit(12);
    if (data) setReconData(data);
  };

  const loadPnl = async () => {
    const { data } = await supabase.from("v_profit_loss_statement").select("*").limit(1);
    if (data && data.length > 0) setPnlData(data[0]);
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
        await supabase.from("bank_transactions").insert(txRows.slice(i, i + 500));
        setBankMsg(`Saved ${Math.min(i + 500, txRows.length)} of ${txRows.length}...`);
      }
      setBankMsg(`Done! ${result.rowCount} transactions imported.`);
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

        if (reportErr) { setUploadMsg(`File ${f + 1} DB error: ${reportErr.message}`); continue; }

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
          await supabase.from("settlement_transactions").insert(txRows.slice(i, i + 500));
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
            <h2 className="text-lg font-bold mb-1">Profit & Loss Statement</h2>
            <p className="text-sm text-gray-500 mb-6">Tax Year {pnlData?.tax_year || 2025} — PaulaDLLC</p>

            {pnlData ? (
              <div className="space-y-4">
                {/* REVENUE */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-4">Revenue</div>
                  {[
                    { label: "Product sales", value: Number(pnlData.product_sales) },
                    { label: "Shipping income", value: Number(pnlData.shipping_income) },
                    { label: "Gift wrap income", value: Number(pnlData.gift_wrap_income) },
                    { label: "Reimbursements", value: Number(pnlData.reimbursements) },
                    { label: "Returns & refunds", value: Number(pnlData.returns_refunds) },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between py-1.5 border-b border-gray-800/50">
                      <span className="text-sm text-gray-300">{row.label}</span>
                      <span className={`text-sm font-mono ${row.value >= 0 ? "text-gray-200" : "text-red-400"}`}>{fmt(row.value)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 mt-2 border-t-2 border-emerald-800">
                    <span className="text-sm font-bold text-emerald-400">GROSS REVENUE</span>
                    <span className="text-base font-bold font-mono text-emerald-400">{fmt(Number(pnlData.gross_revenue))}</span>
                  </div>
                </div>

                {/* COGS */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-4">Cost of goods sold</div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-300">Beginning inventory</span>
                    <span className="text-sm font-mono text-gray-500 italic">Not yet entered</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-300">Purchases (from bank transactions + expenses)</span>
                    <span className="text-sm font-mono text-gray-500 italic">Not yet entered</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-300">Ending inventory</span>
                    <span className="text-sm font-mono text-gray-500 italic">Not yet entered</span>
                  </div>
                  <div className="flex justify-between pt-3 mt-2 border-t-2 border-amber-800">
                    <span className="text-sm font-bold text-amber-400">COST OF GOODS SOLD</span>
                    <span className="text-base font-bold font-mono text-amber-400">{fmt(0)}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">Upload credit card statements in Banking tab and tag sourcing purchases as COGS, or add manually in Expenses tab.</p>
                </div>

                {/* GROSS PROFIT */}
                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-indigo-400">GROSS PROFIT (Revenue - COGS)</span>
                    <span className="text-lg font-bold font-mono text-indigo-400">{fmt(Number(pnlData.gross_revenue))}</span>
                  </div>
                </div>

                {/* AMAZON SELLING FEES */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                  <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-4">Amazon selling fees</div>
                  {[
                    { label: "Referral fees", value: Number(pnlData.referral_fees) },
                    { label: "FBA fulfillment fees", value: Number(pnlData.fba_fulfillment_fees) },
                    { label: "FBA inventory & inbound fees", value: Number(pnlData.fba_inventory_fees) },
                    { label: "Shipping label purchases", value: Number(pnlData.shipping_label_costs) },
                    { label: "Service fees", value: Number(pnlData.service_fees) },
                    { label: "Promotional costs", value: Number(pnlData.promotional_costs) },
                    { label: "Other selling fees", value: Number(pnlData.other_selling_fees) },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between py-1.5 border-b border-gray-800/50">
                      <span className="text-sm text-gray-300">{row.label}</span>
                      <span className="text-sm font-mono text-red-400">-{fmt(row.value)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 mt-2 border-t-2 border-red-800">
                    <span className="text-sm font-bold text-red-400">TOTAL SELLING FEES</span>
                    <span className="text-base font-bold font-mono text-red-400">-{fmt(Number(pnlData.total_selling_fees))}</span>
                  </div>
                </div>

                {/* OPERATING EXPENSES */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                  <div className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-4">Operating expenses (non-Amazon)</div>
                  {totalExpenses > 0 ? (
                    <>
                      {expenses.slice(0, 10).map((e: any, i: number) => (
                        <div key={i} className="flex justify-between py-1.5 border-b border-gray-800/50">
                          <span className="text-sm text-gray-300">{e.expense_categories?.name || "Expense"}</span>
                          <span className="text-sm font-mono text-red-400">-{fmt(Number(e.amount))}</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-3 mt-2 border-t-2 border-orange-800">
                        <span className="text-sm font-bold text-orange-400">TOTAL OPERATING EXPENSES</span>
                        <span className="text-base font-bold font-mono text-orange-400">-{fmt(totalExpenses)}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No operating expenses entered yet. Add expenses in the Expenses tab or upload bank statements in the Banking tab.</p>
                  )}
                </div>

                {/* NET PROFIT */}
                <div className={`rounded-xl p-5 border-2 ${Number(pnlData.net_amazon_profit) - totalExpenses >= 0 ? "bg-emerald-500/5 border-emerald-500/30" : "bg-red-500/5 border-red-500/30"}`}>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-bold text-white uppercase tracking-wider">NET PROFIT (before COGS)</span>
                    <span className={`text-2xl font-bold font-mono ${Number(pnlData.net_amazon_profit) - totalExpenses >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmt(Number(pnlData.net_amazon_profit) - totalExpenses)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center text-xs text-gray-500">
                    <div>
                      <div>Revenue</div>
                      <div className="text-sm font-mono text-emerald-400 mt-1">{fmt(Number(pnlData.gross_revenue))}</div>
                    </div>
                    <div>
                      <div>Amazon fees</div>
                      <div className="text-sm font-mono text-red-400 mt-1">-{fmt(Number(pnlData.total_selling_fees))}</div>
                    </div>
                    <div>
                      <div>Expenses</div>
                      <div className="text-sm font-mono text-red-400 mt-1">-{fmt(totalExpenses)}</div>
                    </div>
                  </div>
                </div>

                {/* TAX MEMO */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Tax memo (informational — not included in P&L)</div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-500">Sales tax collected by Amazon</span>
                    <span className="text-sm font-mono text-gray-500">{fmt(Number(pnlData.tax_collected))}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-500">Marketplace tax withheld & remitted</span>
                    <span className="text-sm font-mono text-gray-500">-{fmt(Number(pnlData.marketplace_tax_withheld))}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-800/50">
                    <span className="text-sm text-gray-500">Bank transfers</span>
                    <span className="text-sm font-mono text-gray-500">-{fmt(Number(pnlData.bank_transfers))}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-sm text-gray-500">Orders / Refunds / Unique SKUs</span>
                    <span className="text-sm font-mono text-gray-500">{pnlData.total_orders} / {pnlData.total_refund_orders} / {pnlData.unique_skus}</span>
                  </div>
                </div>
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
            <h2 className="text-lg font-bold mb-1">Bank Reconciliation</h2>
            <p className="text-sm text-gray-500 mb-6">Accrual vs cash basis — matches Amazon settlements to bank deposits</p>

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
            <h2 className="text-lg font-bold mb-1">Balance Sheet</h2>
            <p className="text-sm text-gray-500 mb-6">As of {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>

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
