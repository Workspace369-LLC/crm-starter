import type { PipelineSummary } from "@/lib/crm";

const num = (n: number | null | undefined) => (n == null ? "-" : String(n));

/**
 * Header for the client list, from pipeline_summary: clients per stage, new, stalled.
 * Render it only when the server offers pipeline_summary and the call worked.
 */
export function PipelineHeader({ summary }: { summary: PipelineSummary }) {
  const stalled = summary.stalled;
  const bound = stalled.count_is_lower_bound ? "+" : "";
  return (
    <section className="summary" aria-label="Pipeline summary">
      <ul className="stagecounts">
        {summary.stages.map((s) => (
          <li key={s.id}><span className={`dot ${s.group}`} /> {s.name} <strong>{num(s.client_count)}</strong></li>
        ))}
      </ul>
      <p className="sub">
        New: <strong>{num(summary.new_clients.last_7_days)}</strong> in 7 days, <strong>{num(summary.new_clients.last_30_days)}</strong> in 30 days
        {" · "}
        Stalled ({stalled.days}+ days in a stage): <strong>{num(stalled.count)}{bound}</strong>
        {stalled.clients.length > 0 && <>: {stalled.clients.slice(0, 3).map((c) => c.name).join(", ")}{(stalled.count ?? 0) > 3 ? "..." : ""}</>}
      </p>
    </section>
  );
}
