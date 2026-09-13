import nodemailer from 'nodemailer';
import type { MailMessage, Mailer } from './mailer';

export class SmtpMailer implements Mailer {
  readonly kind = 'smtp' as const;
  private readonly transport: nodemailer.Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}
