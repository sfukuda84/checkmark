"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/auth/auth-client";
import { FormError } from "@/components/form-error";
import { GoogleButton } from "@/components/google-button";
import { errorMessage } from "@/lib/error-messages";
import { startSignUpConsent } from "./actions";

export function SignUpForm({ googleEnabled, initialError }: { googleEnabled: boolean; initialError: string | null }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);

  async function ensureConsent(): Promise<boolean> {
    const r = await startSignUpConsent(agreed);
    if (!r.ok) {
      setError(errorMessage(r.code));
      return false;
    }
    return true;
  }

  return (
    <>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const form = new FormData(e.currentTarget);
          const email = String(form.get("email") ?? "");
          const password = String(form.get("password") ?? "");
          setPending(true);
          try {
            if (!(await ensureConsent())) return;
            const { error: err } = await authClient.signUp.email({
              email,
              password,
              name: "",
              callbackURL: "/verify-email/callback",
            });
            if (err) {
              setError(errorMessage(err.code));
              return;
            }
            router.push(`/verify-email?email=${encodeURIComponent(email)}`);
          } finally {
            setPending(false);
          }
        }}
      >
        <label htmlFor="email">メールアドレス</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">パスワード（8 文字以上）</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <label className="checkbox">
          <input type="checkbox" name="agreed" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            <Link href="/legal/terms" target="_blank">
              利用規約
            </Link>
            と
            <Link href="/legal/privacy" target="_blank">
              プライバシーポリシー
            </Link>
            に同意する
          </span>
        </label>
        <FormError message={error} />
        <button type="submit" disabled={pending}>
          登録する
        </button>
      </form>
      {googleEnabled && (
        <>
          <p className="muted">または</p>
          <GoogleButton
            label="Google で登録する"
            errorCallbackURL="/sign-up?error=google"
            beforeStart={ensureConsent}
          />
        </>
      )}
      <p>
        登録済みの方は <Link href="/sign-in">ログイン</Link>
      </p>
    </>
  );
}
