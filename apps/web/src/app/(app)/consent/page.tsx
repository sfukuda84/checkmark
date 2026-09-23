import Link from "next/link";
import { consents, eq, getDb } from "@app/db";
import { requireUser } from "@/auth/guards";
import { SignOutButton } from "@/components/sign-out-button";
import { missingConsents } from "@/legal/consent";
import { CURRENT_VERSIONS, DOCUMENT_TITLES } from "@/legal/registry";
import { ConsentForm } from "./consent-form";

export const dynamic = "force-dynamic";

export default async function ConsentPage() {
  const user = await requireUser({ allowWithoutConsent: true });
  const records = await getDb()
    .select({ document: consents.document, version: consents.version })
    .from(consents)
    .where(eq(consents.userId, user.id));
  const missing = missingConsents(records);
  return (
    <>
      <h1>規約への同意</h1>
      <p>
        規約が更新されました。内容をご確認のうえ、同意してください。同意しない場合は、サービスをお使いいただけません。
      </p>
      <ul>
        {missing.map((doc) => (
          <li key={doc}>
            <Link href={`/legal/${doc}`} target="_blank">
              {DOCUMENT_TITLES[doc]}（{CURRENT_VERSIONS[doc]} 版）
            </Link>
          </li>
        ))}
      </ul>
      <ConsentForm versions={CURRENT_VERSIONS} />
      <SignOutButton />
    </>
  );
}
