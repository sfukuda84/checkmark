import type { MailMessage } from "../transport";

export type EmailKind =
  "verify_email" | "reset_password" | "reset_password_google_only" | "change_email_verify" | "change_email_notice";

export interface EmailTemplateInput {
  kind: EmailKind;
  to: string;
  /** 確認・再設定のリンク。通知やログインの案内では、サービスの URL を渡す。 */
  url: string;
}

const SERVICE = "ネーミングチェッカー";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

interface Body {
  subject: string;
  lines: string[];
  linkLabel: string;
}

function body(kind: EmailKind): Body {
  switch (kind) {
    case "verify_email":
      return {
        subject: `【${SERVICE}】メールアドレスの確認`,
        lines: [
          `${SERVICE}にご登録いただき、ありがとうございます。`,
          "次のリンクを開いて、メールアドレスの確認を済ませてください。リンクの有効期限は 24 時間です。",
          "心当たりがない場合は、このメールを破棄してください。",
        ],
        linkLabel: "メールアドレスを確認する",
      };
    case "reset_password":
      return {
        subject: `【${SERVICE}】パスワードの再設定`,
        lines: [
          "パスワードの再設定を受け付けました。",
          "次のリンクを開いて、新しいパスワードを設定してください。リンクの有効期限は 1 時間で、1 回だけ使えます。",
          "心当たりがない場合は、このメールを破棄してください。パスワードは変わりません。",
        ],
        linkLabel: "パスワードを再設定する",
      };
    case "reset_password_google_only":
      return {
        subject: `【${SERVICE}】ログインの方法のご案内`,
        lines: [
          "パスワードの再設定を受け付けましたが、このメールアドレスのアカウントは Google アカウントでログインするよう登録されています。",
          "ログインの画面で「Google でログイン」を選んでください。",
          "心当たりがない場合は、このメールを破棄してください。",
        ],
        linkLabel: "ログインの画面を開く",
      };
    case "change_email_verify":
      return {
        subject: `【${SERVICE}】新しいメールアドレスの確認`,
        lines: [
          "メールアドレスの変更を受け付けました。",
          "次のリンクを開くと、このアドレスへの変更が完了します。リンクの有効期限は 24 時間です。",
          "心当たりがない場合は、このメールを破棄してください。",
        ],
        linkLabel: "変更を完了する",
      };
    case "change_email_notice":
      return {
        subject: `【${SERVICE}】メールアドレスが変更されました`,
        lines: [
          "このアドレスで登録されていたアカウントのメールアドレスが、別のアドレスに変更されました。",
          "心当たりがない場合は、お問い合わせ先までご連絡ください。",
        ],
        linkLabel: `${SERVICE}を開く`,
      };
  }
}

/** メールの文面（件名、テキスト、HTML）を作る。 */
export function renderEmail(input: EmailTemplateInput): MailMessage {
  const b = body(input.kind);
  const text = [...b.lines, "", `${b.linkLabel}: ${input.url}`, "", `― ${SERVICE}`].join("\n");
  const html = [
    ...b.lines.map((l) => `<p>${escapeHtml(l)}</p>`),
    `<p><a href="${escapeHtml(input.url)}">${escapeHtml(b.linkLabel)}</a></p>`,
    `<p>― ${escapeHtml(SERVICE)}</p>`,
  ].join("\n");
  return { to: input.to, subject: b.subject, text, html };
}
