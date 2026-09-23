import Link from "next/link";
import { getDb } from "@app/db";
import { hasPassword } from "@/auth/account-policy";
import { getLoginMethods } from "@/auth/login-methods";
import { requireUser } from "@/auth/guards";
import { SignOutButton } from "@/components/sign-out-button";
import { ChangeEmailForm, DeleteAccountButton } from "./account-actions";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const user = await requireUser();
  const { changed } = await searchParams;
  const accounts = await getLoginMethods(getDb(), user.id);
  const withPassword = hasPassword(accounts);
  return (
    <>
      <h1>アカウントの設定</h1>
      {changed && (
        <p className="notice" role="status">
          メールアドレスを変更しました。
        </p>
      )}
      <h2>メールアドレス</h2>
      <p>{user.email}</p>
      {withPassword ? (
        <ChangeEmailForm />
      ) : (
        <p className="muted">
          Google アカウントで登録したアカウントです。メールアドレスは Google
          アカウントのものを使うため、ここでは変更できません。パスワードの設定もできません。
        </p>
      )}
      <h2>退会</h2>
      <DeleteAccountButton />
      <p>
        <Link href="/">戻る</Link>
      </p>
      <SignOutButton />
    </>
  );
}
