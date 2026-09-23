import { Markdown } from "@/components/markdown";
import { readLegalDocument } from "@/legal/document";
import { CURRENT_VERSIONS } from "@/legal/registry";

export default async function Page() {
  const source = await readLegalDocument("terms");
  return (
    <>
      <Markdown source={source} />
      <p className="muted">版: {CURRENT_VERSIONS.terms}</p>
    </>
  );
}
