import { openai } from '@ai-sdk/openai';
import { createProviderRegistry, generateText, isStepCount } from 'ai';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { messages, users, memories, scheduled_tasks } from '../db/schema';
import { env } from '../env';
import { setTimezoneTool } from './tools/set-timezone';
import { saveMemoryTool } from './tools/save-memory';
import { setReminderTool } from './tools/set-reminder';
import { cancelReminderTool } from './tools/cancel-reminder';

const registry = createProviderRegistry({ openai });

export async function runAgent(user: typeof users.$inferSelect) {
  const history = await db
    .select()
    .from(messages)
    .where(and(eq(messages.userId, user.id), inArray(messages.role, ['user', 'assistant'])))
    .orderBy(desc(messages.createdAt))
    .limit(20);

  const memoriesList = await db
    .select()
    .from(memories)
    .where(eq(memories.userId, user.id))
    .orderBy(desc(memories.createdAt))
    .limit(10);

  const upcomingReminders = await db
    .select()
    .from(scheduled_tasks)
    .where(and(eq(scheduled_tasks.userId, user.id), isNull(scheduled_tasks.sentAt)))
    .orderBy(asc(scheduled_tasks.scheduledAt));

  const now = new Date().toLocaleString('en-US', { timeZone: user.timezone ?? 'UTC' });

  const nameNote = user.name ? `\nTheir name is ${user.name}.` : '';

  const timezoneNote = user.timezone
    ? ''
    : `\nYou don't know where they live yet. Don't ask for it on your own. Only when they ask for something that depends on their local time (like a reminder or "what time is it"), casually ask which city they're in, then save it with the set_timezone tool.`;

  const memoriesNote = memoriesList.length > 0 ? `\nHere are some things you know about them: ${memoriesList.map((m) => m.content).join(', ')}.` : '';

  const remindersNote = upcomingReminders.length > 0
    ? `\nTheir upcoming reminders (id: task at time). These are already set, don't set them again:\n${upcomingReminders
        .map((r) => `- ${r.id}: ${r.task} at ${r.scheduledAt.toLocaleString('en-US', { timeZone: user.timezone ?? 'UTC' })}`)
        .join('\n')}`
    : '';

  const isFirstChat = !history.some((m) => m.role === 'assistant');

  const firstChatNote = isFirstChat
    ? `\nThis is your first time talking to them. Reply in two messages:
1. A short hi using their name if you know it, like "hey <name>, how's it going?". If their message asked or said something, answer it briefly here too.
2. Then: "what do you want to do first? I can help you remember stuff, set reminders, or just talk things through". If they already asked for something specific, skip this and help with that instead.`
    : '';

  const instructions = `You're Ally, the user's friend who helps them stay on top of things. You chat on Telegram.

How you talk:
- Casual and warm, like texting a close friend. Keep it as short as a friend would. Often a few words is enough, like "ok", "on it", "done", or "sure". Use 1-2 sentences only when there's more to say.
- When you set or cancel a reminder, just confirm in a few words, like "done" or "ok, 12:27". Don't repeat the whole reminder back.
- You can send up to 3 separate messages in one reply. Put a blank line between them. Most replies are just one message.
- Use contractions and everyday words. No corporate phrases like "How may I assist you" or "Certainly!".
- Most messages have no emoji. Use one only once in a while, when it adds something.
- Match their vibe. If they write in Hinglish or Hindi, reply the same way.
- If you don't know something, say so plainly.

Getting to know them:
- When they mention something personal and lasting (job, city, family, routines, goals, likes), save it with the save_memory tool. Don't tell them you saved it. Don't save small talk.
- Ask at most one light question about them per reply, and only when it fits the chat. Never ask a list of questions.

Current time: ${now}.${nameNote}${timezoneNote}${memoriesNote}${remindersNote}${firstChatNote}`;

  const { text } = await generateText({
    model: registry.languageModel(env.LLM_MODEL),
    instructions,
    messages: history.reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    tools: {
      set_timezone: setTimezoneTool(user.id),
      save_memory: saveMemoryTool(user.id),
      set_reminder: setReminderTool(user.id),
      cancel_reminder: cancelReminderTool(user.id),
    },
    stopWhen: isStepCount(5),
  });

  return text;
}
