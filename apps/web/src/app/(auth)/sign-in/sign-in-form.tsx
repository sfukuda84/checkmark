"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/auth/auth-client";
import { FormError } from "@/components/form-error";
import { GoogleButton } from "@/components/google-button";
import { errorMessage } from "@/lib/error-messages";

export function SignInForm({ googleEnabled, initialError }: { googleEnabled: boolean; initialError: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setUnverifiedEmail(null);
          const form = new FormData(e.currentTarget);
          const email = String(form.get("email") ?? "");
          const password = String(form.get("password") ?? "");
          setPending(true);
          try {
            const { error: err } = await authClient.signIn.email({ email, password });
            if (err) {
              if (err.code === "ACCOUNT_SUSPENDED") {
                router.push("/suspended");
                return;
              }
              if (err.code === "EMAIL_NOT_VERIFIED") setUnverifiedEmail(email);
              setError(errorMessage(err.code));
              return;
            }
            router.push("/");
            router.refresh();
          } finally {
            setPending(false);
          }
        }}
      >
        <label htmlFor="email">メールアドレス</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">パスワード</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <FormError message={error} />
        {unverifiedEmail && (
          <p>
            <Link href={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}>確認メールを送り直す</Link>
          </p>
        )}
        <button type="submit" disabled={pending}>
          ログイン
        </button>
      </form>
      <p>
        <Link href="/forgot-password">パスワードを忘れた場合</Link>
      </p>
      {googleEnabled && (
        <>
          <p className="muted">または</p>
          <GoogleButton label="Google でログイン" errorCallbackURL="/sign-in?error=google" />
        </>
      )}
      <p>
        はじめての方は <Link href="/sign-up">アカウントの登録</Link>
      </p>
    </>
  );
}
