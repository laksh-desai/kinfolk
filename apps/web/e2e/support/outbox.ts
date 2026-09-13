import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The API's development mailer writes here during e2e runs (see apps/api/scripts/e2eStack.ts). */
const MAIL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../api/var/e2e/mail');

interface StoredMail {
  to: string;
  subject: string;
  text: string;
  sentAt: string;
}

export async function waitForMail(to: string, match: RegExp, timeoutMs = 15_000): Promise<StoredMail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let names: string[] = [];
    try {
      names = await readdir(MAIL_DIR);
    } catch {
      // outbox not created yet
    }
    const mails = await Promise.all(
      names.filter((name) => name.endsWith('.json')).map(async (name) => JSON.parse(await readFile(path.join(MAIL_DIR, name), 'utf8')) as StoredMail),
    );
    const found = mails
      .filter((mail) => mail.to === to && match.test(mail.subject + mail.text))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email to ${to} matching ${match}`);
}
