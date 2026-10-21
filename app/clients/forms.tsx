"use client";
import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { createClientAction, moveStageAction, updateCustomFieldsAction, type DraftState } from "../actions";
import type { Stage } from "@/lib/crm";

function Status({ state }: { state: DraftState }) {
  if (!state) return null;
  return <span className="status" role="status"> {state.message} {state.approvalUrl && <a href={state.approvalUrl}>Open approval</a>}{state.href && <Link href={state.href}>Open client</Link>}</span>;
}

export function MoveStage({ clientId, stages, current }: { clientId: string; stages: Stage[]; current?: string }) {
  const [state, action, pending] = useActionState<DraftState, FormData>(moveStageAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="clientId" value={clientId} />
      <select name="stage" defaultValue={current ?? ""} aria-label="Move to stage" onChange={(e) => e.currentTarget.form?.requestSubmit()} disabled={pending}>
        {!current && <option value="" disabled>Move to...</option>}
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <Status state={state} />
    </form>
  );
}

/** `children` are the server-rendered custom field inputs. */
export function CustomFieldsForm({ clientId, children }: { clientId: string; children: ReactNode }) {
  const [state, action, pending] = useActionState<DraftState, FormData>(updateCustomFieldsAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="clientId" value={clientId} />
      <div className="fields">{children}</div>
      <div className="formfoot">
        <button className="primary" disabled={pending}>{pending ? "Saving..." : "Save custom fields"}</button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function NewClientForm({ children }: { children: ReactNode }) {
  const [state, action, pending] = useActionState<DraftState, FormData>(createClientAction, null);
  const [key] = useState(() => crypto.randomUUID());
  return (
    <form action={action}>
      <input type="hidden" name="key" value={key} />
      <section className="panel">
        <div className="panelhead"><h2>Details</h2></div>
        <div className="panelbody">
          <div className="fields">
            <label className="field"><span className="lbl">Name</span><input name="name" required /></label>
            <label className="field"><span className="lbl">Email</span><input name="email" type="email" /></label>
            <label className="field"><span className="lbl">Company</span><input name="company" /></label>
            <label className="field"><span className="lbl">Type</span>
              <select name="lifecycle_stage" defaultValue="client"><option value="client">Client</option><option value="prospect">Prospect (starts in Lead)</option></select>
            </label>
          </div>
        </div>
      </section>
      {children && (
        <section className="panel">
          <div className="panelhead"><h2>Custom fields</h2></div>
          <div className="panelbody"><div className="fields">{children}</div></div>
        </section>
      )}
      <div className="formfoot">
        <button className="primary" disabled={pending}>{pending ? "Creating..." : "Create client"}</button>
        <Status state={state} />
      </div>
    </form>
  );
}
