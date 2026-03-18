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
import { Upload, FileText, TrendingUp, DollarSign, AlertTriangle, Package, MessageSquare, Plus, Download, LogOut, ChevronDown } from "lucide-react";
import Link from "next/link";

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

  // File upload handler
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setUploadMsg("Parsing settlement report...");

    try {
      const text = await file.text();
      const result = parseSettlementReport(text) as ParseResult;

      if (result.error) {
        setUploadMsg(`Error: ${result.error}`);
        setUploading(false);
        return;
      }

      setUploadMsg(`Found ${result.rowCount} transactions. Saving to database...`);

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

      if (reportErr) throw reportErr;

      // Batch insert transactions (chunks of 500)
      const txRows = result.transactions.map((tx: any) => ({
        user_id: user.id,
        report_id: report.id,
        settlement_id: tx.settlementId,
        transaction_type: tx.transactionType,
        order_id: tx.orderId,
        merchant_order_id: tx.merchantOrderId,
        adjustment_id: tx.adjustmentId,
        shipment_id: tx.shipmentId,
        marketplace_name: tx.marketplaceName,
        amount_type: tx.amountType,
        amount_description: tx.amountDescription,
        amount: tx.amount,
        quantity_purchased: tx.quantityPurchased,
        posted_date: tx.postedDate,
        posted_date_time: tx.postedDateTime,
        sku: tx.sku,
        asin: tx.asin,
        category: tx.category,
        subcategory: tx.subcategory,
      }));

      for (let i = 0; i < txRows.length; i += 500) {
        const chunk = txRows.slice(i, i + 500);
        const { error: txErr } = await supabase.from("settlement_transactions").insert(chunk);
        if (txErr) throw txErr;
        setUploadMsg(`Saved ${Math.min(i + 500, txRows.length)} of ${txRows.length} transactions...`);
      }

      setUploadMsg(`Done! ${result.rowCount} transactions imported.`);
      setShowUpload(false);
      await loadData();
    } catch (err: any) {
      setUploadMsg(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
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
    { id: "products", label: "Products", icon: Package },
    { id: "fees", label: "Fees", icon: DollarSign },
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
              <div className="font-semibold mb-1">Drop your Amazon Settlement Report</div>
              <div className="text-sm text-gray-500 mb-2">Seller Central → Reports → Payments → Download Flat File V2</div>
              <div className="text-sm text-gray-600">Supports TSV and CSV</div>
              <input type="file" accept=".tsv,.csv,.txt" onChange={handleFileUpload} className="hidden" disabled={uploading} />
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
