import Link from "next/link";
import { getDb } from "@app/db";
import { requireUser } from "@/auth/guards";
import { formatDateTime, prefillLines } from "@/checks/presentation";
import { findOwnedCheck } from "@/checks/repository";
import { getUsageSummary } from "@/checks/usage";
import { CheckForm } from "./check-form";
import { ClassPicker } from "./class-picker";

export const dynamic = "force-dynamic";

/** 入力画面（contracts/routes.md）。?from=<チェック> なら、そのチェックの候補と読みを入れた状態で開く（FR-014a）。 */
export default async function NewCheckPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const user = await requireUser();
  const { from } = await searchParams;
  const [usage, source] = await Promise.all([
    getUsageSummary(getDb(), user.id, new Date()),
    from ? findOwnedCheck(getDb(), user.id, from) : Promise.resolve(null),
  ]);
  const exhausted = usage.remaining === 0;
  return (
    <>
      <h1>名前の候補をチェックする</h1>
      <p className="notice" role="status">
        今月の残り: <strong>{usage.remaining} 件</strong>（上限 {usage.limit} 件）。{formatDateTime(usage.resetsAt)}{" "}
        に戻ります。
      </p>
      {exhausted && (
        <p className="error" role="alert">
          今月チェックできる候補の数の上限に達しました。{formatDateTime(usage.resetsAt)} から、またチェックできます。
        </p>
      )}
      {source && (
        <p className="muted">
          前回のチェックの候補と、照合に使った読みを入れてあります。読みを直してからチェックしてください。
        </p>
      )}
      <CheckForm defaultCandidates={source ? prefillLines(source.candidates) : ""} disabled={exhausted}>
        <ClassPicker selected={source?.check.classes.map(Number) ?? []} />
      </CheckForm>
      <p className="muted">結果は簡易チェックであり、商標登録できるかどうかなどの法的な判断ではありません。</p>
      <p>
        <Link href="/">トップへ戻る</Link>
      </p>
    </>
  );
}
