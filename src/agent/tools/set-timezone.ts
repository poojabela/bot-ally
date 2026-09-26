import { tool } from 'ai';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client';
import { users } from '../../db/schema';

export function setTimezoneTool(userId: string) {
  return tool({
    description: "Save the user's timezone. Call this when the user tells you their city or timezone.",
    inputSchema: z.object({
      timezone: z.string().describe('IANA timezone name, for example Asia/Kolkata or America/New_York'),
    }),
    execute: async ({ timezone }) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      } catch {
        return { error: `Unknown timezone: ${timezone}` };
      }
      await db.update(users).set({ timezone }).where(eq(users.id, userId));
      return { saved: timezone };
    },
  });
}
