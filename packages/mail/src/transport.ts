export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** メールの送信手段のアダプタ（憲章 III）。失敗したら例外を投げ、呼び出し側（ジョブ）が再送する。 */
export interface MailTransport {
  send(message: MailMessage): Promise<{ id: string }>;
}
