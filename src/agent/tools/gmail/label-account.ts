import { tool } from 'ai';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../db/client';
import { connections } from '../../../db/schema';

export function labelAccountTool(userId: string) {
  return tool({
    description: 'Give one of their connected Gmail accounts a label, like "work" or "personal".',
    inputSchema: z.object({
      email: z.string().describe('The connected Gmail address'),
      label: z.string().describe('Short label, for example "work" or "personal"'),
    }),
    execute: async ({ email, label }) => {
      const [updated] = await db
        .update(connections)
        .set({ metadata: sql`coalesce(${connections.metadata}, '{}'::jsonb) || jsonb_build_object('label', ${label}::text)` })
        .where(and(eq(connections.userId, userId), eq(connections.provider, 'google'), eq(connections.externalAccountId, email)))
        .returning({ id: connections.id });
      if (!updated) return { error: `No connected account ${email}` };
      return { labelled: { email, label } };
    },
  });
}
