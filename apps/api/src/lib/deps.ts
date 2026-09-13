import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import type { Env } from './env';
import { FileMailer } from './mailer/fileMailer';
import type { Mailer } from './mailer/mailer';
import { SmtpMailer } from './mailer/smtpMailer';
import { FsStorage } from './storage/fsStorage';
import { S3Storage } from './storage/s3Storage';
import type { ObjectStorage } from './storage/storage';
import { DevOAuthProvider } from '../modules/auth/oauth/devOAuthProvider';
import { GoogleOAuthProvider } from '../modules/auth/oauth/googleOAuthProvider';
import type { OAuthProvider } from '../modules/auth/oauth/oauthProvider';

/** Everything a request handler may touch. Built once at boot; tests build their own. */
export interface AppDeps {
  env: Env;
  prisma: PrismaClient;
  mailer: Mailer;
  storage: ObjectStorage;
  oauth: OAuthProvider;
  now: () => Date;
}

export function createDeps(env: Env, baseDir: string, prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL })): AppDeps {
  const mailer: Mailer = env.SMTP_URL
    ? new SmtpMailer(env.SMTP_URL, env.MAIL_FROM)
    : new FileMailer(path.resolve(baseDir, env.MAIL_OUTBOX_DIR));

  // Both groups are all-or-nothing (enforced in parseEnv), so checking one member suffices.
  const storage: ObjectStorage =
    env.S3_ENDPOINT && env.S3_REGION && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? new S3Storage({
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION,
          bucket: env.S3_BUCKET,
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        })
      : new FsStorage(path.resolve(baseDir, env.LOCAL_STORAGE_DIR), env.SESSION_SECRET);

  const oauth: OAuthProvider =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? new GoogleOAuthProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
      : new DevOAuthProvider(env.SESSION_SECRET);

  return { env, prisma, mailer, storage, oauth, now: () => new Date() };
}
