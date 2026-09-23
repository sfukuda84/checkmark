import Link from "next/link";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  if (error || !token) {
    return (
      <>
        <h1>パスワードの再設定</h1>
        <p className="error" role="alert">
          リンクが無効か、有効期限が切れています。
        </p>
        <p>
          <Link href="/forgot-password">もう一度、再設定を依頼する</Link>
        </p>
      </>
    );
  }
  return (
    <>
      <h1>新しいパスワードの設定</h1>
      <ResetForm token={token} />
    </>
  );
}
