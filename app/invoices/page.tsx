import { formatDate, listInvoices } from "@/lib/crm";
import { money, pillClass, statusLabel } from "../status";

export const dynamic = "force-dynamic";

export default async function Invoices() {
  const invoices = await listInvoices();
  return (
    <>
      <div className="pagehead"><div><h1>Invoices</h1><p className="sub">{invoices.length} total</p></div></div>
      {invoices.length === 0 ? <p className="empty">No invoices yet.</p> : (
        <div className="panel tablewrap">
          <table>
            <thead><tr><th>Number</th><th>Client</th><th>Status</th><th className="num">Total</th><th>Due</th></tr></thead>
            <tbody>{invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.number ?? i.id}</td>
                <td>{i.client_name ?? ""}</td>
                <td><span className={pillClass(i.status, i.is_overdue)}>{i.is_overdue ? "Overdue" : statusLabel(i.status)}</span></td>
                <td className="num">{money(i.total, i.currency)}</td>
                <td>{formatDate(i.due_date)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
