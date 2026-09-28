import { tool } from 'ai';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client';
import { scheduled_tasks, users } from '../../db/schema';
import { nextDailyRun } from '../../time';

export function setDailySummaryTool(userId: string) {
  return tool({
    description: "Set or change the time of their daily inbox summary. Ally sends a summary of that day's emails every day at this time.",
    inputSchema: z.object({
      time: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .describe("The user's local time in 24h HH:MM, for example 22:45"),
    }),
    execute: async ({ time }) => {
      const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (!user?.timezone) {
        return { error: "You don't know their timezone yet. Ask which city they're in first." };
      }
      const scheduledAt = nextDailyRun(time, user.timezone);
      const where = and(eq(scheduled_tasks.userId, userId), eq(scheduled_tasks.kind, 'inbox_summary'));
      const existing = await db.query.scheduled_tasks.findFirst({ where });
      if (existing) {
        await db.update(scheduled_tasks).set({ scheduledAt }).where(where);
      } else {
        await db.insert(scheduled_tasks).values({ userId, task: 'daily inbox summary', kind: 'inbox_summary', scheduledAt });
      }
      return { saved: { time } };
    },
  });
}
