export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Outbound email seam. Production uses SMTP; development and tests use a file outbox. */
export interface Mailer {
  readonly kind: 'smtp' | 'file';
  send(message: MailMessage): Promise<void>;
}
