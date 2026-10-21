import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "CRM starter" };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="topbar">
          <span className="brand">CRM</span>
          <Link href="/" className="navlink">Pipeline</Link>
          <Link href="/invoices" className="navlink">Invoices</Link>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
