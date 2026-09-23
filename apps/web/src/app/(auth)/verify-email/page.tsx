import { ResendForm } from "./resend-form";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <>
      <h1>メールアドレスの確認</h1>
      <p className="notice">
        確認メールを送りました。メールのリンクを開くと、登録が完了します。リンクの有効期限は 24 時間です。
        確認が済むまでは、サービスをお使いいただけません。
      </p>
      <ResendForm initialEmail={email ?? ""} />
    </>
  );
}
