"use client";

import { useState } from "react";
import { authClient } from "@/auth/auth-client";
import { FormError } from "@/components/form-error";
import { errorMessage } from "@/lib/error-messages";

export function ForgotForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  if (done) {
    return (
      <p className="notice" role="status">
        入力されたメールアドレスが登録されていれば、再設定の案内をお送りしました。リンクの有効期限は 1 時間です。
      </p>
    );
  }
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const email = String(new FormData(e.currentTarget).get("email") ?? "");
        setPending(true);
        const { error: err } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        setPending(false);
        if (err) setError(errorMessage(err.code));
        else setDone(true);
      }}
    >
      <label htmlFor="email">メールアドレス</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <FormError message={error} />
      <button type="submit" disabled={pending}>
        再設定の案内を送る
      </button>
    </form>
  );
}
