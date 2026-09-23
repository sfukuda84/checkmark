/** エラーコードから利用者への表示文言への対応（contracts/server-actions.md）。存在の有無が分かる文言にしない。 */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "メールアドレスまたはパスワードが正しくありません。",
  EMAIL_NOT_VERIFIED: "メールアドレスの確認が済んでいません。確認メールのリンクを開いてください。",
  TOO_MANY_ATTEMPTS: "試行の回数が多すぎます。しばらく待ってからお試しください。",
  TOO_MANY_REQUESTS: "試行の回数が多すぎます。しばらく待ってからお試しください。",
  PASSWORD_COMPROMISED: "このパスワードは過去の漏えいで知られています。別のパスワードにしてください。",
  PASSWORD_TOO_SHORT: "パスワードは 8 文字以上にしてください。",
  PASSWORD_TOO_LONG: "パスワードは 128 文字以内にしてください。",
  CONSENT_REQUIRED: "利用規約とプライバシーポリシーへの同意が必要です。",
  CONSENT_OUTDATED: "規約が更新されました。画面を読み込み直して、最新の内容をご確認ください。",
  ACCOUNT_SUSPENDED: "このアカウントは利用が停止されています。",
  REAUTH_REQUIRED: "本人確認のため、もう一度パスワードを入力してください。",
  EMAIL_CHANGE_NOT_ALLOWED: "Google アカウントで登録したアカウントのメールアドレスは変更できません。",
  INVALID_PASSWORD: "パスワードが正しくありません。",
  INVALID_TOKEN: "リンクが無効か、有効期限が切れています。もう一度お試しください。",
  TOKEN_EXPIRED: "リンクの有効期限が切れています。もう一度お試しください。",
  USER_ALREADY_EXISTS: "登録を受け付けました。確認メールをご確認ください。",
  // 一括チェック（001 contracts/server-actions.md）
  NO_CANDIDATES: "候補を 1 件以上入力してください。",
  TOO_MANY_CANDIDATES: "1 回にチェックできる候補は 10 件までです。",
  INVALID_CANDIDATE: "入力を直してください。",
  INVALID_CLASS: "区分を選び直してください。",
  QUOTA_EXCEEDED: "今月チェックできる候補の数の上限を超えています。",
  TOO_MANY_RUNNING: "確認中のチェックが 3 件あります。終わるまでお待ちください。",
  NOT_FOUND: "見つかりませんでした。",
  NOT_RETRYABLE: "この候補にはすでに結果が出ています。",
};

/** 入力の行ごとのエラーの理由（001 FR-004）。 */
const INPUT_REASONS: Record<string, string> = {
  EMPTY: "候補名がありません",
  TOO_LONG: "50 文字までにしてください",
  INVALID_CHARS: "使えない文字が含まれています（絵文字や一部の記号は使えません）",
  INVALID_READING: "読みはカタカナかひらがなで入力してください",
  READING_TOO_LONG: "読みは 50 文字までにしてください",
};

export function inputReasonMessage(reason: string): string {
  return INPUT_REASONS[reason] ?? "入力を直してください";
}

export function errorMessage(
  code: string | undefined | null,
  fallback = "処理に失敗しました。時間をおいてもう一度お試しください。",
): string {
  if (!code) return fallback;
  return MESSAGES[code] ?? fallback;
}

/** リダイレクト先を、サイト内のパスに限る（オープンリダイレクトを防ぐ）。 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
