"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { errorMessage } from "@/lib/error-messages";
import { acceptConsent } from "./actions";

export function ConsentForm({ versions }: { versions: { terms: string; privacy: string } }) {
  const [state, action, pending] = useActionState(acceptConsent, { error: null });
  return (
    <form action={action}>
      <input type="hidden" name="terms" value={versions.terms} />
      <input type="hidden" name="privacy" value={versions.privacy} />
      <FormError message={state.error ? errorMessage(state.error) : null} />
      <button type="submit" disabled={pending}>
        同意して続ける
      </button>
    </form>
  );
}
