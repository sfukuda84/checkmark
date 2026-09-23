import Link from "next/link";
import { getDb } from "@app/db";
import { requireUser } from "@/auth/guards";
import { formatDateTime } from "@/checks/presentation";
import { listRecentChecks } from "@/checks/repository";
import { getUsageSummary } from "@/checks/usage";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const now = new Date();
  const [usage, recent] = await Promise.all([
    getUsageSummary(getDb(), user.id, now),
    listRecentChecks(getDb(), user.id),
  ]);
  return (
    <>
      <h1>ネーミングチェッカー</h1>
      <p>名前の候補をまとめて入れて、商標の登録・出願の状況を確かめられます。</p>
      <p>
        <Link href="/checks/new" className="button">
          候補をチェックする
        </Link>
      </p>
      <p className="muted">
        今月の残り: {usage.remaining} 件（上限 {usage.limit} 件）。{formatDateTime(usage.resetsAt)} に戻ります。
      </p>
      <h2>直近のチェック</h2>
      {recent.length === 0 ? (
        <p className="muted">まだチェックしていません。</p>
      ) : (
        <ul className="recent-checks">
          {recent.map((c) => (
            <li key={c.id}>
              <Link href={`/checks/${c.id}`}>{formatDateTime(c.createdAt)} のチェック</Link>
              <span className="muted">
                （候補 {c.total} 件・{c.running ? `確認中 ${c.completed}/${c.total}` : "完了"}）
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">ログイン中: {user.email}</p>
      <p>
        <Link href="/account">アカウントの設定</Link>
      </p>
      <SignOutButton />
    </>
  );
}
