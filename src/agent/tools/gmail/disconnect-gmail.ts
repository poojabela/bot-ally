import { tool } from 'ai';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { decrypt } from '../../../crypto';
import { db } from '../../../db/client';
import { connections } from '../../../db/schema';
import { createOAuthClient } from '../../../gmail/oauth';

export function disconnectGmailTool(userId: string) {
  return tool({
    description: 'Disconnect one of their Gmail accounts. Only call this after they clearly said yes to removing it.',
    inputSchema: z.object({
      email: z.string().describe('The connected Gmail address to remove'),
    }),
    execute: async ({ email }) => {
      const where = and(eq(connections.userId, userId), eq(connections.provider, 'google'), eq(connections.externalAccountId, email));
      const connection = await db.query.connections.findFirst({ where });
      if (!connection) return { error: `No connected account ${email}` };

      try {
        await createOAuthClient().revokeToken(decrypt(connection.credentialsEncrypted!));
      } catch (error) {
        console.error(`Failed to revoke Google token for ${email}`, error);
      }
      await db.delete(connections).where(where);
      return { disconnected: email };
    },
  });
}
