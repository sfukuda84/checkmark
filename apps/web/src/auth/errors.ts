import { APIError } from "better-auth/api";

/** 利用者に返すエラーコード（contracts/server-actions.md）。 */
export const AUTH_ERROR = {
  TOO_MANY_ATTEMPTS: "TOO_MANY_ATTEMPTS",
  PASSWORD_COMPROMISED: "PASSWORD_COMPROMISED",
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
  EMAIL_CHANGE_NOT_ALLOWED: "EMAIL_CHANGE_NOT_ALLOWED",
} as const;

export function tooManyAttempts(): APIError {
  return new APIError("TOO_MANY_REQUESTS", {
    code: AUTH_ERROR.TOO_MANY_ATTEMPTS,
    message: "試行の回数が多すぎます。しばらく待ってからお試しください。",
  });
}

export function passwordCompromised(): APIError {
  return new APIError("BAD_REQUEST", {
    code: AUTH_ERROR.PASSWORD_COMPROMISED,
    message: "このパスワードは過去の漏えいで知られています。別のパスワードにしてください。",
  });
}

export function consentRequired(): APIError {
  return new APIError("BAD_REQUEST", {
    code: AUTH_ERROR.CONSENT_REQUIRED,
    message: "利用規約とプライバシーポリシーへの同意が必要です。",
  });
}

export function accountSuspended(): APIError {
  return new APIError("FORBIDDEN", {
    code: AUTH_ERROR.ACCOUNT_SUSPENDED,
    message: "このアカウントは利用が停止されています。",
  });
}

export function reauthRequired(): APIError {
  return new APIError("FORBIDDEN", {
    code: AUTH_ERROR.REAUTH_REQUIRED,
    message: "本人確認のため、もう一度ログインしてください。",
  });
}

export function emailChangeNotAllowed(): APIError {
  return new APIError("FORBIDDEN", {
    code: AUTH_ERROR.EMAIL_CHANGE_NOT_ALLOWED,
    message: "Google アカウントで登録したアカウントのメールアドレスは変更できません。",
  });
}
