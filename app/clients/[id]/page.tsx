import Link from "next/link";
import { notFound } from "next/navigation";
import { getCapabilities, getClient, getClientStages, getCustomFieldDefs, listInvoices, listProposals } from "@/lib/crm";
import { initials, money, phoneLabel, pillClass, statusLabel } from "../../status";
import { CustomFieldInputs } from "../custom-fields";
import { CustomFieldsForm } from "../forms";
import { DraftForm } from "./draft-form";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [client, proposals, invoices] = await Promise.all([getClient(id), listProposals(id), listInvoices(id)]);
  if (!client) notFound();
  // Custom fields are hidden when clients_update does not accept them. clients_get returns the current values.
  const caps = await getCapabilities();
  const [defs, stages] = await Promise.all([
    caps.customFields ? getCustomFieldDefs().catch(() => null) : null,
    getClientStages().catch(() => null),
  ]);
  const stage = stages?.find((s) => s.id === client.stage_id);
  return (
    <div className="narrow">
      <Link href="/" className="crumb">&larr; Pipeline</Link>
      <div className="pagehead">
        <div className="profile">
          <span className="avatar" aria-hidden>{initials(client.name)}</span>
          <div>
            <h1>{client.name}</h1>
            <p className="sub">{[client.company, client.email, phoneLabel(client.phone)].filter(Boolean).join(" · ") || "No contact details"}</p>
          </div>
        </div>
        {stage && <span className="pill info">{stage.name}</span>}
      </div>

      {defs && defs.length > 0 && (
        <section className="panel">
          <div className="panelhead"><h2>Custom fields</h2></div>
          <div className="panelbody">
            <p className="hint">
              {client.custom_fields_unavailable
                ? "Current values couldn't be read. Blank fields are left unchanged."
                : "Change a field and save. Blank fields are left unchanged."}
            </p>
            {/* Keyed by the stored values: React resets a form after its action to the old defaults, so remount the inputs on the saved ones. */}
            <CustomFieldsForm clientId={id}><CustomFieldInputs key={JSON.stringify(client.custom_fields ?? {})} defs={defs} values={client.custom_fields} /></CustomFieldsForm>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panelhead"><h2>Proposals</h2></div>
        <div className="panelbody"><DraftForm clientId={id} /></div>
        {proposals.length === 0 ? <p className="none">None yet.</p> : (
          <div className="tablewrap"><table>
            <tbody>{proposals.map((p) => (
              <tr key={p.id}><td>{p.title ?? p.id}</td><td><span className={pillClass(p.status)}>{statusLabel(p.status)}</span></td><td className="num">{money(p.total, p.currency)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="panel">
        <div className="panelhead"><h2>Invoices</h2></div>
        {invoices.length === 0 ? <p className="none">None yet.</p> : (
          <div className="tablewrap"><table>
            <tbody>{invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.number ?? i.id}</td>
                <td><span className={pillClass(i.status, i.is_overdue)}>{i.is_overdue ? "Overdue" : statusLabel(i.status)}</span></td>
                <td className="num">{money(i.total, i.currency)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
