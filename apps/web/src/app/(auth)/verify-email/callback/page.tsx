import Link from "next/link";

export default async function VerifyCallbackPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (error) {
    return (
      <>
        <h1>確認できませんでした</h1>
        <p className="error" role="alert">
          リンクが無効か、有効期限が切れています。
        </p>
        <p>
          <Link href="/verify-email">確認メールを送り直す</Link>
        </p>
      </>
    );
  }
  return (
    <>
      <h1>メールアドレスを確認しました</h1>
      <p>
        <Link href="/" className="button">
          はじめる
        </Link>
      </p>
    </>
  );
}
