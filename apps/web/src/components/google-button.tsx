"use client";

import { useState } from "react";
import { authClient } from "@/auth/auth-client";

export function GoogleButton({
  label,
  callbackURL = "/",
  errorCallbackURL,
  beforeStart,
}: {
  label: string;
  callbackURL?: string;
  errorCallbackURL: string;
  /** 同意の確認など、Google へ移る前の処理。false を返したら移らない。 */
  beforeStart?: () => Promise<boolean>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="secondary"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        if (beforeStart && !(await beforeStart())) {
          setPending(false);
          return;
        }
        await authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL });
      }}
    >
      {label}
    </button>
  );
}
