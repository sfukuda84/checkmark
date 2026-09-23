import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <>
      <h1>パスワードの再設定</h1>
      <p>登録したメールアドレスを入力してください。</p>
      <ForgotForm />
    </>
  );
}
