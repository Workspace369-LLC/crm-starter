"use client";
import { useActionState, useState } from "react";
import { draftProposalAction, type DraftState } from "../../actions";

export function DraftForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<DraftState, FormData>(draftProposalAction, null);
  // One key per mounted form: a double-click or retry returns the same draft instead of a duplicate.
  const [key] = useState(() => crypto.randomUUID());
  return (
    <form action={action}>
      <div className="inlineform">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="key" value={key} />
        <input name="title" placeholder="Proposal title" aria-label="Proposal title" required />
        <button className="primary" disabled={pending}>{pending ? "Creating..." : "Draft proposal"}</button>
      </div>
      {state && <p className="status" role="status">{state.message} {state.approvalUrl && <a href={state.approvalUrl}>Open approval</a>}</p>}
    </form>
  );
}
