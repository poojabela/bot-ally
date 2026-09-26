import type TelegramBot from 'node-telegram-bot-api';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { db } from './db/client';
import { messages, scheduled_tasks, users } from './db/schema';

export async function sendDueReminders(bot: TelegramBot) {
  const due = await db
    .select({ id: scheduled_tasks.id, task: scheduled_tasks.task, userId: users.id, chatId: users.chat_id })
    .from(scheduled_tasks)
    .innerJoin(users, eq(scheduled_tasks.userId, users.id))
    .where(and(isNull(scheduled_tasks.sentAt), lte(scheduled_tasks.scheduledAt, new Date())));

  for (const reminder of due) {
    try {
      const content = reminder.task;
      await bot.sendMessage(reminder.chatId, content);
      await db.update(scheduled_tasks).set({ sentAt: new Date() }).where(eq(scheduled_tasks.id, reminder.id));
      await db.insert(messages).values({ userId: reminder.userId, role: 'assistant', content });
    } catch (error) {
      console.error(`Failed to send reminder ${reminder.id}`, error);
    }
  }
}
