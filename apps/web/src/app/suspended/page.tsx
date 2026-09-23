import { serverEnv } from "@app/shared/env";

export const dynamic = "force-dynamic";

export default function SuspendedPage() {
  const { SUPPORT_CONTACT } = serverEnv();
  return (
    <>
      <h1>ご利用が停止されています</h1>
      <p>このアカウントは、利用が停止されています。お心当たりがない場合は、次の問い合わせ先までご連絡ください。</p>
      <p>
        <a href={`mailto:${SUPPORT_CONTACT}`}>{SUPPORT_CONTACT}</a>
      </p>
    </>
  );
}
