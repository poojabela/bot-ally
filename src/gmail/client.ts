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
