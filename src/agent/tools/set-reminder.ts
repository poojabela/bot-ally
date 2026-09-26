import { tool } from 'ai';
import { and, eq, ilike, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client';
import { scheduled_tasks, users } from '../../db/schema';

export function setReminderTool(userId: string) {
  return tool({
    description: 'Set a reminder. Ally will message the user at that time.',
    inputSchema: z.object({
      task: z
        .string()
        .describe('The exact message to send them at that time, written like a friend texting, for example "time to take a bath" or "call mom!"'),
      localTime: z.iso
        .datetime({ local: true })
        .describe("When to remind them, in the user's local time, for example 2026-09-25T18:00:00"),
    }),
    execute: async ({ task, localTime }) => {
      const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (!user?.timezone) {
        return { error: "You don't know their timezone yet. Ask which city they're in first." };
      }
      const scheduledAt = localTimeToDate(localTime, user.timezone);
      if (scheduledAt <= new Date()) {
        return { error: 'That time is in the past.' };
      }
      const existing = await db.query.scheduled_tasks.findFirst({
        where: and(
          eq(scheduled_tasks.userId, userId),
          ilike(scheduled_tasks.task, task),
          eq(scheduled_tasks.scheduledAt, scheduledAt),
          isNull(scheduled_tasks.sentAt),
        ),
      });
      if (existing) {
        return { alreadySet: { task, localTime } };
      }
      await db.insert(scheduled_tasks).values({ userId, task, scheduledAt });
      return { saved: { task, localTime } };
    },
  });
}

function localTimeToDate(localTime: string, timezone: string) {
  const asUtc = new Date(`${localTime}Z`);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
    .formatToParts(asUtc)
    .find((part) => part.type === 'timeZoneName')!.value;
  const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMinutes = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  return new Date(asUtc.getTime() - offsetMinutes * 60_000);
}
