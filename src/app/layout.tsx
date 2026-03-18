import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShelfKeeper — Amazon Seller Accounting",
  description: "The accounting platform built by a CPA, for Amazon sellers. Replace QuickBooks with one tool.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
