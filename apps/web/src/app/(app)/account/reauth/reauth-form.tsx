"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { FormError } from "@/components/form-error";
import { GoogleButton } from "@/components/google-button";
import { errorMessage } from "@/lib/error-messages";
import { reauthenticate } from "../actions";

export function ReauthForm({
  next,
  withPassword,
  googleEnabled,
}: {
  next: string;
  withPassword: boolean;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(reauthenticate, { error: null, ok: false });
  useEffect(() => {
    if (state.ok) router.push(next);
  }, [state.ok, next, router]);
  if (!withPassword) {
    return googleEnabled ? (
      <GoogleButton
        label="Google でログインし直す"
        callbackURL={next}
        errorCallbackURL="/account/reauth?error=google"
      />
    ) : (
      <p className="error">Google でのログインが使えないため、本人確認ができません。</p>
    );
  }
  return (
    <form action={action}>
      <label htmlFor="password">パスワード</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <FormError message={state.error ? errorMessage(state.error) : null} />
      <button type="submit" disabled={pending}>
        確認する
      </button>
    </form>
  );
}
