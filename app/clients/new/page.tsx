import Link from "next/link";
import { getCapabilities, getCustomFieldDefs } from "@/lib/crm";
import { CustomFieldInputs } from "../custom-fields";
import { NewClientForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function NewClient() {
  const caps = await getCapabilities();
  const defs = caps.customFields ? await getCustomFieldDefs().catch(() => null) : null;
  return (
    <div className="narrow">
      <Link href="/" className="crumb">&larr; Pipeline</Link>
      <div className="pagehead"><h1>New client</h1></div>
      <NewClientForm>{defs && <CustomFieldInputs defs={defs} blank="Not set" />}</NewClientForm>
    </div>
  );
}
