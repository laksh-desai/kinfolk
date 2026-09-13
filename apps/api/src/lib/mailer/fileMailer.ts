import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MailMessage, Mailer } from './mailer';

export interface StoredMail extends MailMessage {
  id: string;
  sentAt: string;
}

/**
 * Writes each message as JSON into a directory. A real adapter, not a stub: development and
 * end-to-end tests read OTP codes and invite links from here. Nothing is logged to stdout,
 * so no PII reaches logs.
 */
export class FileMailer implements Mailer {
  readonly kind = 'file' as const;

  constructor(private readonly directory: string) {}

  async send(message: MailMessage): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const sentAt = new Date().toISOString();
    const id = randomUUID();
    const stored: StoredMail = { ...message, id, sentAt };
    const fileName = `${sentAt.replace(/[:.]/g, '-')}-${id}.json`;
    await writeFile(path.join(this.directory, fileName), JSON.stringify(stored, null, 2), 'utf8');
  }

  /** Newest first. */
  async list(): Promise<StoredMail[]> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch {
      return [];
    }
    const mails = await Promise.all(
      names
        .filter((name) => name.endsWith('.json'))
        .map(async (name) => JSON.parse(await readFile(path.join(this.directory, name), 'utf8')) as StoredMail),
    );
    return mails.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  }
}
