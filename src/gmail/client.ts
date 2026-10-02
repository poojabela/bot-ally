import { gmail } from '@googleapis/gmail';
import { and, eq } from 'drizzle-orm';
import { decrypt } from '../crypto';
import { db } from '../db/client';
import { connections } from '../db/schema';
import { createOAuthClient } from './oauth';

export async function getGmailAccounts(userId: string) {
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.provider, 'google'), eq(connections.status, 'active')));

  return rows.map((row) => {
    const auth = createOAuthClient();
    auth.setCredentials({ refresh_token: decrypt(row.credentialsEncrypted!) });
    return {
      connectionId: row.id,
      email: row.externalAccountId,
      label: (row.metadata as { label?: string } | null)?.label ?? null,
      gmail: gmail({ version: 'v1', auth }),
    };
  });
}

export type GmailAccount = Awaited<ReturnType<typeof getGmailAccounts>>[number];

export class GmailAccessExpiredError extends Error {
  constructor(readonly email: string) {
    super(`Gmail access expired for ${email}`);
  }
}

export async function withGmail<T>(account: GmailAccount, call: () => Promise<T>) {
  try {
    return await call();
  } catch (error) {
    if ((error as { response?: { data?: { error?: string } } }).response?.data?.error !== 'invalid_grant') throw error;
    await db.update(connections).set({ status: 'error' }).where(eq(connections.id, account.connectionId));
    throw new GmailAccessExpiredError(account.email);
  }
}

export async function getExpiredGmailEmails(userId: string) {
  const rows = await db
    .select({ email: connections.externalAccountId })
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.provider, 'google'), eq(connections.status, 'error')));
  return rows.map((row) => row.email);
}
