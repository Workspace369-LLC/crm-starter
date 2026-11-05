"use client";
import { useActionState, useState } from "react";
import { completeFollowUpAction, createFollowUpAction, type DraftState } from "../../actions";

function Status({ state }: { state: DraftState }) {
  if (!state) return null;
  return <p className="status" role="status">{state.message} {state.approvalUrl && <a href={state.approvalUrl}>Open approval</a>}</p>;
}

export function ScheduleFollowUpForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<DraftState, FormData>(createFollowUpAction, null);
  // One key per mounted form: a double-click or retry returns the same follow-up instead of a duplicate.
  const [key] = useState(() => crypto.randomUUID());
  return (
    <form action={action}>
      <div className="inlineform">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="key" value={key} />
        <input name="title" placeholder="What to do, e.g. Call about the quote" aria-label="Follow-up" required />
        <input name="due" type="date" aria-label="Due date" required />
        <select name="channel" aria-label="How" defaultValue="">
          <option value="">Any</option><option value="call">Call</option><option value="email">Email</option><option value="sms">Text</option><option value="meeting">Meeting</option>
        </select>
        <button className="primary" disabled={pending}>{pending ? "Scheduling..." : "Schedule"}</button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function CompleteFollowUpForm({ clientId, followUpId }: { clientId: string; followUpId: string }) {
  const [state, action, pending] = useActionState<DraftState, FormData>(completeFollowUpAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="followUpId" value={followUpId} />
      <button disabled={pending}>{pending ? "Saving..." : "Mark done"}</button>
      <Status state={state} />
    </form>
  );
}
