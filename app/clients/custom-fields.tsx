import { customFieldFormValue, type Client, type CustomFieldDef } from "@/lib/crm";

/** One input per custom field definition, named `cf_<key>`, opened on `values` when given. Server component: no token involved. */
export function CustomFieldInputs({ defs, values, blank = "(unchanged)" }: { defs: CustomFieldDef[]; values?: Client["custom_fields"]; blank?: string }) {
  return (
    <>
      {defs.map((d) => {
        const name = `cf_${d.key}`;
        const label = d.label || d.key;
        const current = customFieldFormValue(d, values?.[d.key]);
        return (
          <label key={d.id} className="field">
            <span className="lbl">{label}</span>
            {d.type === "select" ? (
              <select name={name} defaultValue={current}>
                <option value="">{blank}</option>
                {d.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : d.type === "boolean" ? (
              <select name={name} defaultValue={current}>
                <option value="">{blank}</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input name={name} type={d.type === "number" ? "number" : d.type === "date" ? "date" : "text"} step={d.type === "number" ? "any" : undefined} defaultValue={current} />
            )}
          </label>
        );
      })}
    </>
  );
}
