"use client";

import { useActionState, type ReactNode } from "react";
import { FormError } from "@/components/form-error";
import { startCheckAction, type StartCheckState } from "../actions";

const initial: StartCheckState = { error: null, details: [] };

/** 候補の入力と実行（FR-001、FR-004a）。 */
export function CheckForm({
  defaultCandidates,
  disabled,
  children,
}: {
  defaultCandidates: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState(startCheckAction, initial);
  return (
    <form action={action}>
      <label htmlFor="candidates">名前の候補（1 行に 1 件、10 件まで）</label>
      <p id="candidates-help" className="muted">
        読みを添えるときは「候補名 / ヨミ」と書きます（例: 桜の道 /
        サクラノミチ）。添えなければ、読みを推定して照合します。
      </p>
      <textarea
        id="candidates"
        name="candidates"
        rows={8}
        defaultValue={defaultCandidates}
        aria-describedby="candidates-help"
        required
      />
      {children}
      <FormError message={state.error} />
      {state.details.length > 0 && (
        <ul className="error">
          {state.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      <button type="submit" disabled={pending || disabled}>
        {pending ? "受け付けています…" : "チェックする"}
      </button>
    </form>
  );
}
