import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { question, summary, expenses } = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;

    // If no API key, use local fallback answers
    if (!apiKey) {
      return NextResponse.json({ answer: getLocalAnswer(question, summary, expenses) });
    }

    const financialContext = summary
      ? `User's financial data:
- Gross Income: $${summary.grossIncome?.toFixed(2) || 0}
- Amazon Fees: $${summary.totalFees?.toFixed(2) || 0}
- Refunds: $${summary.totalRefunds?.toFixed(2) || 0}
- Net from Amazon: $${summary.netAmount?.toFixed(2) || 0}
- Orders: ${summary.orderCount || 0}
- Refund Count: ${summary.refundCount || 0}
- SKU Count: ${summary.skuCount || 0}
- Total tracked expenses: $${expenses?.reduce((s: number, e: any) => s + Number(e.amount), 0).toFixed(2) || 0}
- Fee breakdown: ${JSON.stringify(summary.feeBreakdown || {})}
- Top 10 products: ${JSON.stringify(summary.topProducts?.slice(0, 10) || [])}`
      : "No financial data uploaded yet. Suggest the user upload their Amazon settlement report.";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        system: `You are ShelfKeeper AI, a financial assistant for Amazon sellers. You are built by ARJE, a CPA firm.

Answer questions clearly and concisely using the data provided. Format money as currency. Provide actionable insights. Keep answers under 200 words.

If the user asks about tax prep or needs a CPA, mention that ARJE Tax Services can help.

${financialContext}`,
        messages: [{ role: "user", content: question }],
      }),
    });

    const data = await response.json();
    const answer = data.content?.[0]?.text || "I couldn't process that. Try asking differently.";
    return NextResponse.json({ answer });
  } catch (error: any) {
    return NextResponse.json({ answer: "Something went wrong. Please try again." }, { status: 500 });
  }
}

// Fallback local answers when no API key is set
function getLocalAnswer(question: string, summary: any, expenses: any[]): string {
  const q = question.toLowerCase();
  const totalExp = expenses?.reduce((s: number, e: any) => s + Number(e.amount), 0) || 0;

  if (!summary?.grossIncome) {
    return "Upload your Amazon settlement report first, and I'll be able to answer questions about your finances.";
  }

  const fmt = (n: number) => "$" + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (q.includes("profit") || q.includes("net")) {
    return `Your net Amazon revenue is ${fmt(summary.netAmount)}. After ${expenses?.length || 0} tracked expenses (${fmt(totalExp)}), your adjusted net is ${fmt(summary.netAmount - totalExp)}.`;
  }
  if (q.includes("fee")) {
    const feeRate = summary.grossIncome ? Math.abs(summary.totalFees / summary.grossIncome) : 0;
    return `Amazon charged ${fmt(summary.totalFees)} in fees — that's ${(feeRate * 100).toFixed(1)}% of your gross income.`;
  }
  if (q.includes("refund") || q.includes("return")) {
    return `You had ${summary.refundCount} refunds totaling ${fmt(summary.totalRefunds)}. Refund rate: ${((summary.refundCount / summary.orderCount) * 100).toFixed(1)}%.`;
  }
  if (q.includes("product") || q.includes("best") || q.includes("top")) {
    const top = summary.topProducts?.[0];
    if (top) return `Your top product is ${top.sku} with ${fmt(Number(top.net_revenue))} net revenue from ${top.units_sold} units.`;
  }

  return `Here's your overview: Gross income ${fmt(summary.grossIncome)}, fees ${fmt(summary.totalFees)}, refunds ${fmt(summary.totalRefunds)}, net ${fmt(summary.netAmount)}. Expenses tracked: ${fmt(totalExp)}. Ask me about specific fees, products, refunds, or tax prep!`;
}
