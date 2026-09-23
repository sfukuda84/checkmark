"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/auth/auth-client";
import { FormError } from "@/components/form-error";
import { errorMessage } from "@/lib/error-messages";

export function ResetForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  if (done) {
    return (
      <>
        <p className="notice" role="status">
          パスワードを変更しました。ほかの端末のログインは解除されています。
        </p>
        <p>
          <Link href="/sign-in" className="button">
            ログイン
          </Link>
        </p>
      </>
    );
  }
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const newPassword = String(new FormData(e.currentTarget).get("password") ?? "");
        setPending(true);
        const { error: err } = await authClient.resetPassword({ newPassword, token });
        setPending(false);
        if (err) setError(errorMessage(err.code));
        else setDone(true);
      }}
    >
      <label htmlFor="password">新しいパスワード（8 文字以上）</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      <FormError message={error} />
      <button type="submit" disabled={pending}>
        パスワードを変更する
      </button>
    </form>
  );
}
