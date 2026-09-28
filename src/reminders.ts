import type TelegramBot from 'node-telegram-bot-api';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { db } from './db/client';
import { messages, scheduled_tasks, users } from './db/schema';
import { summarizeInbox } from './gmail/summary';
import { toTelegramHtml } from './telegram';
import { localTimeOfDay, nextDailyRun } from './time';

export async function sendDueReminders(bot: TelegramBot) {
  const due = await db
    .select({ id: scheduled_tasks.id, task: scheduled_tasks.task, kind: scheduled_tasks.kind, scheduledAt: scheduled_tasks.scheduledAt, user: users })
    .from(scheduled_tasks)
    .innerJoin(users, eq(scheduled_tasks.userId, users.id))
    .where(and(isNull(scheduled_tasks.sentAt), lte(scheduled_tasks.scheduledAt, new Date())));

  for (const reminder of due) {
    if (reminder.kind === 'inbox_summary') {
      await sendInboxSummary(bot, reminder);
      continue;
    }
    try {
      const content = reminder.task;
      await bot.sendMessage(reminder.user.chat_id, content);
      await db.update(scheduled_tasks).set({ sentAt: new Date() }).where(eq(scheduled_tasks.id, reminder.id));
      await db.insert(messages).values({ userId: reminder.user.id, role: 'assistant', content });
    } catch (error) {
      console.error(`Failed to send reminder ${reminder.id}`, error);
    }
  }
}

async function sendInboxSummary(
  bot: TelegramBot,
  summary: { id: string; scheduledAt: Date; user: typeof users.$inferSelect },
) {
  const timezone = summary.user.timezone ?? 'UTC';
  const [claimed] = await db
    .update(scheduled_tasks)
    .set({ scheduledAt: nextDailyRun(localTimeOfDay(summary.scheduledAt, timezone), timezone) })
    .where(and(eq(scheduled_tasks.id, summary.id), eq(scheduled_tasks.scheduledAt, summary.scheduledAt)))
    .returning({ id: scheduled_tasks.id });
  if (!claimed) return;

  try {
    const text = await summarizeInbox(summary.user);
    if (!text) return;
    const parts = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      await bot.sendMessage(summary.user.chat_id, toTelegramHtml(part), { parse_mode: 'HTML' });
      await db.insert(messages).values({ userId: summary.user.id, role: 'assistant', content: part });
    }
  } catch (error) {
    console.error(`Failed to send inbox summary ${summary.id}`, error);
  }
}
