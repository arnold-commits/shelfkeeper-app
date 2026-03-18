"use client";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0A0F1C] text-white">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex justify-between items-center max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-sm font-bold">S</div>
          <span className="text-lg font-bold tracking-tight">ShelfKeeper</span>
        </div>
        <div className="flex gap-3">
          <Link href="/login" className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Log in</Link>
          <Link href="/login?signup=true" className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition">Start Free Trial</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-block px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-medium mb-6">
          Built by a CPA, for Amazon sellers
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight mb-6">
          Stop overpaying for
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400"> Amazon accounting</span>
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
          Upload your settlement report. Get instant P&L, fee analysis, SKU profitability, and tax-ready reports. Ask questions in plain English. No QuickBooks needed.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/login?signup=true" className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold text-base transition shadow-lg shadow-indigo-500/20">
            Start Free — 14 Day Trial
          </Link>
          <Link href="/dashboard" className="px-8 py-3 border border-gray-700 hover:border-gray-500 rounded-xl font-medium text-base transition text-gray-300">
            View Demo
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-20 grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { title: "Upload & Done", desc: "Drag in your Amazon settlement report. We parse every transaction, categorize fees, and generate your P&L in seconds.", icon: "📄" },
          { title: "Ask AI Anything", desc: "\"What's my most profitable product?\" \"How much am I paying in FBA fees?\" Get instant answers about your finances.", icon: "🤖" },
          { title: "Tax-Ready Reports", desc: "Schedule C categories pre-mapped. Export your P&L, fee breakdown, and expenses directly to your CPA.", icon: "📊" },
          { title: "Track Everything", desc: "Income, expenses, mileage, receipts, inventory costs — all in one place. No more spreadsheets.", icon: "💰" },
          { title: "Fee Analysis", desc: "See exactly what Amazon charges you. Referral fees, FBA fees, storage fees — broken down by product.", icon: "🔍" },
          { title: "Replace QuickBooks", desc: "Built specifically for Amazon sellers. No confusing chart of accounts. No double-entry bookkeeping. Just clarity.", icon: "✨" },
        ].map((f, i) => (
          <div key={i} className="bg-[#111827] border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition">
            <div className="text-2xl mb-3">{f.icon}</div>
            <h3 className="text-base font-semibold mb-2">{f.title}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Pricing */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-3">Simple pricing. Everything included.</h2>
        <p className="text-gray-400 mb-12">No feature gating. No surprise fees. Cancel anytime.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { name: "Monthly", price: "$39.99", period: "/month", desc: "Full access, billed monthly", cta: "Start Free Trial", featured: false },
            { name: "Annual", price: "$249.99", period: "/year", desc: "Save 48% — just $20.83/mo", cta: "Start Free Trial", featured: true },
            { name: "Lifetime", price: "$599.99", period: "one-time", desc: "Pay once, use forever", cta: "Get Lifetime Access", featured: false },
          ].map((p, i) => (
            <div key={i} className={`rounded-xl p-6 border ${p.featured ? "border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500/20" : "border-gray-800 bg-[#111827]"}`}>
              {p.featured && <div className="text-xs font-bold text-indigo-400 mb-3">MOST POPULAR</div>}
              <div className="text-lg font-semibold mb-1">{p.name}</div>
              <div className="text-3xl font-bold mb-1">{p.price}<span className="text-sm text-gray-500 font-normal"> {p.period}</span></div>
              <p className="text-sm text-gray-400 mb-6">{p.desc}</p>
              <Link href="/login?signup=true" className={`block w-full py-2.5 rounded-lg font-medium text-sm text-center transition ${p.featured ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "border border-gray-700 hover:border-gray-500 text-gray-300"}`}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-8 text-center text-sm text-gray-500">
        <p>ShelfKeeper by ARJE · Built by a CPA who does this for a living</p>
        <p className="mt-1">Need tax help? <span className="text-indigo-400 cursor-pointer">Connect with ARJE Tax Services</span></p>
      </footer>
    </div>
  );
}
