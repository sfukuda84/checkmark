"use client";

import { useState } from "react";
import { authClient } from "@/auth/auth-client";
import { FormError } from "@/components/form-error";
import { errorMessage } from "@/lib/error-messages";

export function ResendForm({ initialEmail }: { initialEmail: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setDone(false);
        const email = String(new FormData(e.currentTarget).get("email") ?? "");
        setPending(true);
        const { error: err } = await authClient.sendVerificationEmail({ email, callbackURL: "/verify-email/callback" });
        setPending(false);
        if (err) setError(errorMessage(err.code));
        else setDone(true);
      }}
    >
      <label htmlFor="email">メールアドレス</label>
      <input id="email" name="email" type="email" defaultValue={initialEmail} autoComplete="email" required />
      <FormError message={error} />
      {done && <p role="status">確認メールを送りました。届かない場合は、迷惑メールのフォルダもご確認ください。</p>}
      <button type="submit" className="secondary" disabled={pending}>
        確認メールを送り直す
      </button>
    </form>
  );
}
