import type { Capabilities, FollowUp } from "@/lib/crm";
import { CompleteFollowUpForm, ScheduleFollowUpForm } from "./followup-forms";

const GROUP_LABEL: Record<string, string> = { overdue: "Overdue", today: "Today", this_week: "This week", suggested: "Suggested" };

/** What the follow-up panel shows for these capabilities. The whole panel is hidden when it has nothing to offer. */
export function followUpView(caps: Capabilities, next: FollowUp | null) {
  const show = caps.followUps && next !== null;
  return {
    panel: caps.followUps || caps.followUpCreate,
    list: show,
    // follow_ups_complete only closes reminders; computed follow-ups (chase a proposal, reply owed) are done in the Workspace369 app.
    canComplete: show && caps.followUpComplete && next!.source_ref?.kind === "reminder",
    canCreate: caps.followUpCreate,
  };
}

export const dueLabel = (iso: string) => (iso ? iso.slice(0, 10) : "");

/** Next follow-up for a client, with Schedule and Mark done buttons. Each part hides when its tool is not in tools/list. */
export function FollowUpPanel({ clientId, caps, next }: { clientId: string; caps: Capabilities; next: FollowUp | null }) {
  const v = followUpView(caps, next);
  if (!v.panel) return null;
  return (
    <section className="panel">
      <div className="panelhead"><h2>Next follow-up</h2></div>
      {caps.followUps && (next ? (
        <div className="panelbody followup">
          <div>
            <span className="name">{next.title}</span>
            <p className="sub">
              <span className={next.group === "overdue" ? "pill bad" : "pill info"}>{GROUP_LABEL[next.group] ?? next.group}</span>{" "}
              Due {dueLabel(next.due_at)}{next.channel ? ` · ${next.channel}` : ""}
            </p>
            {next.reason && next.reason !== next.title && <p className="hint">{next.reason}</p>}
          </div>
          {v.canComplete && <CompleteFollowUpForm clientId={clientId} followUpId={next.source_ref!.id} />}
        </div>
      ) : <p className="none">No follow-up scheduled.</p>)}
      {v.canCreate && <div className="panelbody"><ScheduleFollowUpForm clientId={clientId} /></div>}
    </section>
  );
}
