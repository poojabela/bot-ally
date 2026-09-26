import { tool } from 'ai';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client';
import { scheduled_tasks } from '../../db/schema';

export function cancelReminderTool(userId: string) {
  return tool({
    description: 'Cancel one of the user\'s upcoming reminders.',
    inputSchema: z.object({
      id: z.uuid().describe('The reminder id from their upcoming reminders list'),
    }),
    execute: async ({ id }) => {
      const [cancelled] = await db
        .delete(scheduled_tasks)
        .where(and(eq(scheduled_tasks.id, id), eq(scheduled_tasks.userId, userId), isNull(scheduled_tasks.sentAt)))
        .returning({ task: scheduled_tasks.task });
      if (!cancelled) {
        return { error: 'No upcoming reminder with that id.' };
      }
      return { cancelled: cancelled.task };
    },
  });
}
