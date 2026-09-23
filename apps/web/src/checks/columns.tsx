import type { ReactNode } from "react";
import type { TrademarkMatch } from "@app/db";
import { jplatpatUrl } from "@app/trademark";
import { retryCandidateAction } from "@/app/(app)/checks/actions";
import { formatDate, formatDateTime, isDatasetStale } from "./presentation";
import type { CandidateView } from "./repository";

/**
 * 比較表の列の定義（research R7、FR-018）。002・003 は、ここに列を足す。
 * render はサーバーで描画する。
 */
export interface CheckColumn {
  key: string;
  header: string;
  render(candidate: CandidateView, context: { checkId: string }): ReactNode;
}

const STATUS_LABEL = { pending: "出願中", registered: "登録" } as const;

function MatchList({ matches }: { matches: TrademarkMatch[] }) {
  return (
    <ul className="matches">
      {matches.map((m) => (
        <li key={`${m.kind}-${m.applicationNumber}`}>
          <strong>{m.markText}</strong>
          {m.kind === "similar" && <span className="muted">（似ている度合い {Math.round(m.score * 100)}%）</span>}
          <br />
          {m.registrationNumber ? `登録第 ${m.registrationNumber} 号` : `出願 ${m.applicationNumber}`}・
          {STATUS_LABEL[m.status]}
          <br />
          {m.reading && <>称呼: {m.reading}・</>}権利者: {m.holderName}
          <br />
          区分: {m.classes.map((c) => `第 ${c} 類`).join("、")}
          <br />
          <a href={jplatpatUrl(m.applicationNumber)} target="_blank" rel="noopener noreferrer">
            J-PlatPat で詳細を見る（新しいタブ）
          </a>
        </li>
      ))}
    </ul>
  );
}

function TrademarkCell({ candidate, checkId }: { candidate: CandidateView; checkId: string }) {
  const r = candidate.result;
  if (candidate.status === "queued" || candidate.status === "running") return <span className="pending">確認中…</span>;
  if (candidate.status === "unknown" || !r || r.outcome === "unknown") {
    return (
      <div>
        <span className="outcome unknown">不明（確認できなかった）</span>
        <form action={retryCandidateAction}>
          <input type="hidden" name="checkId" value={checkId} />
          <input type="hidden" name="candidateId" value={candidate.id} />
          <button type="submit" className="secondary small">
            この候補をやり直す
          </button>
        </form>
      </div>
    );
  }
  const identical = r.matches.filter((m) => m.kind === "identical");
  const similar = r.matches.filter((m) => m.kind === "similar");
  return (
    <div>
      {r.outcome === "identical" && <span className="outcome identical">同一の商標あり（{identical.length} 件）</span>}
      {r.outcome === "similar" && <span className="outcome similar">類似の商標あり（{similar.length} 件）</span>}
      {r.outcome === "none" && <span className="outcome none">見つからなかった（登録できるとは限りません）</span>}
      {r.outcome === "identical" && similar.length > 0 && (
        <p className="muted">ほかに類似の商標が {similar.length} 件あります。</p>
      )}
      {r.readingUnavailable && (
        <p className="muted">
          読みが得られなかったため、読みが似た商標は調べていません。読みを添えてチェックし直してください。
        </p>
      )}
      {r.matches.length > 0 && (
        <details>
          <summary>該当した商標を見る</summary>
          <MatchList matches={r.matches} />
        </details>
      )}
      <p className="small muted">
        {r.datasetAsOf ? `${formatDate(r.datasetAsOf)} 時点のデータ` : "基準日不明"}・調べた日時{" "}
        {formatDateTime(r.checkedAt)}
        {isDatasetStale(r.datasetAsOf, r.checkedAt) && <strong className="error">（データが古い）</strong>}
      </p>
    </div>
  );
}

export const trademarkColumn: CheckColumn = {
  key: "trademark",
  header: "商標",
  render: (candidate, { checkId }) => <TrademarkCell candidate={candidate} checkId={checkId} />,
};

export const CHECK_COLUMNS: CheckColumn[] = [trademarkColumn];
