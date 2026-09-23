import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@app/db";
import { requireUser } from "@/auth/guards";
import { CHECK_COLUMNS } from "@/checks/columns";
import { classesLabel, formatDate, formatDateTime, isDatasetStale, latestDataset } from "@/checks/presentation";
import { findOwnedCheck } from "@/checks/repository";
import { getUsageSummary } from "@/checks/usage";
import { errorMessage } from "@/lib/error-messages";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";

/** 結果画面（比較表）。本人のチェックでなければ 404（FR-030）。 */
export default async function CheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ merged?: string; retryError?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { merged, retryError } = await searchParams;
  const owned = await findOwnedCheck(getDb(), user.id, id);
  if (!owned) notFound();
  const mergedCount = Number(merged);
  const usage = retryError === "QUOTA_EXCEEDED" ? await getUsageSummary(getDb(), user.id, new Date()) : null;
  const dataset = latestDataset(owned.candidates.map((c) => c.result));

  return (
    <>
      <h1>チェックの結果</h1>
      <p className="notice">
        <strong>簡易チェックです。</strong>
        商標登録できるかどうかや、権利を侵害しないかといった法的な判断ではありません。「見つからなかった」場合も、使える・登録できるとは限りません。
      </p>
      {Number.isInteger(mergedCount) && mergedCount > 0 && (
        <p className="notice" role="status">
          同じ候補を {mergedCount} 件まとめました。
        </p>
      )}
      {retryError && (
        <p className="error" role="alert">
          {errorMessage(retryError)}
          {usage &&
            ` 今月の残りは ${usage.remaining} 件（上限 ${usage.limit} 件）です。${formatDateTime(usage.resetsAt)} に戻ります。`}
        </p>
      )}
      <dl className="meta">
        <dt>実行日時</dt>
        <dd>{formatDateTime(owned.check.createdAt)}</dd>
        <dt>区分</dt>
        <dd>{classesLabel(owned.check.classes.map(Number))}</dd>
        <dt>進み具合</dt>
        <dd aria-live="polite">
          {owned.total} 件中 {owned.completed} 件が完了{owned.running ? "（確認中）" : ""}
        </dd>
        <dt>商標データ</dt>
        <dd>
          {dataset
            ? `${formatDate(dataset.asOf)} 時点までの出願・登録（調べた日時 ${formatDateTime(dataset.checkedAt)}）`
            : owned.running
              ? "調べ終わった候補がまだありません"
              : "商標データの基準日を確認できませんでした（どの候補も確認できませんでした）"}
        </dd>
      </dl>
      {dataset && isDatasetStale(dataset.asOf, dataset.checkedAt) && (
        <p className="error" role="alert">
          照合に使った商標データが 30 日以上前のものです。最近の出願が含まれていない恐れがあります。
        </p>
      )}
      <div className="table-scroll">
        <table className="comparison">
          <caption>候補ごとのチェックの結果</caption>
          <thead>
            <tr>
              <th scope="col">候補</th>
              {CHECK_COLUMNS.map((col) => (
                <th scope="col" key={col.key}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {owned.candidates.map((c) => (
              <tr key={c.id}>
                <th scope="row">
                  {c.inputText}
                  {c.reading && (
                    <div className="small muted">
                      読み: {c.reading}
                      {c.readingEstimated && "（推定）"}
                    </div>
                  )}
                  {c.status === "done" && (c.readingEstimated || c.result?.readingUnavailable) && (
                    <div className="small">
                      読みが違う場合は、
                      <Link href={`/checks/new?from=${owned.check.id}`}>読みを添えてもう一度チェック</Link>
                      してください。
                    </div>
                  )}
                </th>
                {CHECK_COLUMNS.map((col) => (
                  <td key={col.key}>{col.render(c, { checkId: owned.check.id })}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <Link href="/checks/new">別の候補をチェックする</Link>・<Link href="/">トップへ戻る</Link>
      </p>
      <AutoRefresh active={owned.running} />
    </>
  );
}
