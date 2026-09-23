import Link from "next/link";
import { requireUser } from "@/auth/guards";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  return (
    <>
      <h1>ネーミングチェッカー</h1>
      <p>名前の候補を、商標・Google 検索・ドメイン・SNS でまとめて確かめられるようになります（準備中）。</p>
      <p className="muted">ログイン中: {user.email}</p>
      <p>
        <Link href="/account">アカウントの設定</Link>
      </p>
      <SignOutButton />
    </>
  );
}
