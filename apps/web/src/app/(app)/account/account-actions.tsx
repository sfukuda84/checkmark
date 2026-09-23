"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/auth/auth-client";
import { FormError } from "@/components/form-error";
import { errorMessage } from "@/lib/error-messages";

export function ChangeEmailForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  if (sent) {
    return (
      <p className="notice" role="status">
        新しいメールアドレスに確認メールを送りました。リンクを開くと変更が完了します（有効期限 24
        時間）。確認するまでは、今のメールアドレスのままお使いいただけます。
      </p>
    );
  }
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const newEmail = String(new FormData(e.currentTarget).get("newEmail") ?? "");
        setPending(true);
        const { error: err } = await authClient.changeEmail({ newEmail, callbackURL: "/account?changed=1" });
        setPending(false);
        if (err?.code === "REAUTH_REQUIRED") {
          router.push("/account/reauth?next=/account");
          return;
        }
        if (err) setError(errorMessage(err.code));
        else setSent(true);
      }}
    >
      <label htmlFor="newEmail">新しいメールアドレス</label>
      <input id="newEmail" name="newEmail" type="email" autoComplete="email" required />
      <FormError message={error} />
      <button type="submit" disabled={pending}>
        メールアドレスを変更する
      </button>
    </form>
  );
}

export function DeleteAccountButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="danger" onClick={() => setConfirming(true)}>
        退会する
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-labelledby="delete-title" className="notice">
      <p id="delete-title">
        <strong>退会すると、アカウントと、これまでのチェックの候補名・結果がすべて削除され、元に戻せません。</strong>
      </p>
      <FormError message={error} />
      <button
        type="button"
        className="danger"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const { error: err } = await authClient.deleteUser({});
          setPending(false);
          if (err?.code === "REAUTH_REQUIRED") {
            router.push("/account/reauth?next=/account");
            return;
          }
          if (err) {
            setError(errorMessage(err.code));
            return;
          }
          router.push("/account-deleted");
        }}
      >
        削除して退会する
      </button>{" "}
      <button type="button" className="secondary" onClick={() => setConfirming(false)}>
        やめる
      </button>
    </div>
  );
}
