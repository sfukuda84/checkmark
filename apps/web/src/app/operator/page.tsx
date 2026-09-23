import { requireOperator } from "@/auth/guards";

export const dynamic = "force-dynamic";

/** 運営者向けの画面の入口（中身は 005-operator-console）。 */
export default async function OperatorPage() {
  await requireOperator();
  return (
    <>
      <h1>運営者向けの画面</h1>
      <p className="muted">準備中です。</p>
    </>
  );
}
