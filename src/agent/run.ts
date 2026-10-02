import { generateText, isStepCount } from 'ai';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { messages, users, memories, scheduled_tasks } from '../db/schema';
import { env } from '../env';
import { registry } from './model';
import { setTimezoneTool } from './tools/set-timezone';
import { saveMemoryTool } from './tools/save-memory';
import { setReminderTool } from './tools/set-reminder';
import { cancelReminderTool } from './tools/cancel-reminder';
import { setDailySummaryTool } from './tools/set-daily-summary';
import { disconnectGmailTool } from './tools/gmail/disconnect-gmail';
import { labelAccountTool } from './tools/gmail/label-account';
import { searchEmailsTool } from './tools/gmail/search-emails';
import { readEmailTool } from './tools/gmail/read-email';
import { draftReplyTool } from './tools/gmail/draft-reply';
import { getExpiredGmailEmails, getGmailAccounts } from '../gmail/client';
import { connectUrl } from '../gmail/oauth';
import { localTimeOfDay } from '../time';

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

  const gmailAccounts = await getGmailAccounts(user.id);
  const expiredGmailEmails = await getExpiredGmailEmails(user.id);

  const now = new Date().toLocaleString('en-US', { timeZone: user.timezone ?? 'UTC' });

  const nameNote = user.name ? `\nTheir name is ${user.name}.` : '';

  const timezoneNote = user.timezone
    ? ''
    : `\nYou don't know where they live yet. Don't ask for it on your own. Only when they ask for something that depends on their local time (like a reminder or "what time is it"), casually ask which city they're in, then save it with the set_timezone tool.`;

  const memoriesNote = memoriesList.length > 0 ? `\nHere are some things you know about them: ${memoriesList.map((m) => m.content).join(', ')}.` : '';

  const remindersNote = upcomingReminders.length > 0
    ? `\nTheir upcoming reminders (id: task at time). These are already set, don't set them again:\n${upcomingReminders
        .map((r) =>
          r.kind === 'inbox_summary'
            ? `- ${r.id}: daily inbox summary, every day at ${localTimeOfDay(r.scheduledAt, user.timezone ?? 'UTC')}`
            : `- ${r.id}: ${r.task} at ${r.scheduledAt.toLocaleString('en-US', { timeZone: user.timezone ?? 'UTC' })}`,
        )
        .join('\n')}`
    : '';

  const gmailNote = gmailAccounts.length > 0
    ? `\nTheir connected Gmail accounts:\n${gmailAccounts.map((a) => `- ${a.email}${a.label ? ` (${a.label})` : ''}`).join('\n')}\nTo connect another account, send them this link: ${connectUrl(user.id)}\nTo remove an account, ask them to confirm first, then use disconnect_gmail.`
    : `\nThey haven't connected Gmail yet. When they want anything email related, send them this link to connect: ${connectUrl(user.id)}`;

  const expiredGmailNote = expiredGmailEmails.length > 0
    ? `\nGmail access expired for: ${expiredGmailEmails.join(', ')}. You can't read those until they reconnect. Tell them once, casually, and send this link: ${connectUrl(user.id)}`
    : '';

  const isFirstChat = !history.some((m) => m.role === 'assistant');

  const firstChatNote = isFirstChat
    ? `\nThis is your first time talking to them. Reply in two messages:
1. A short hi using their name in lowercase if you know it, like "hey pooja!". If their message asked something, answer it briefly here too.
2. One line on what you do, like "i keep an eye on your gmail, summarize stuff and draft replies for you". If Gmail isn't connected, add the connect link, like "[connect your gmail](link) and we're good to go".`
    : '';

  const instructions = `You're Ally, the user's Gmail assistant. You chat on Telegram.

What you do:
- Help them stay on top of their email: summarize and search their inbox, draft replies they send from Gmail, and remind them to follow up on emails.
- Send a summary of that day's inbox every day at a time they pick, with set_daily_summary. To stop it, cancel it with cancel_reminder.
- Reminders are only for following up on an email.
- If they ask for anything not about their email (general questions, jokes, reminders not tied to an email), say in a few words that you only help with email.

How you talk:
- Casual and warm, like texting a close friend. Keep it as short as a friend would. Often a few words is enough, like "ok", "on it", "done", or "sure". Use 1-2 sentences only when there's more to say.
- Write in lowercase, names too, like "hey pooja".
- Never paste a raw link. Put it behind a few words as [text](url), like [connect gmail](url).
- When you set or cancel a reminder, just confirm in a few words, like "done" or "ok, 12:27". Don't repeat the whole reminder back.
- You can send up to 3 separate messages in one reply. Put a blank line between them. Most replies are just one message.
- When there are a few things to list, like emails, put each on its own line starting with "• ". Keep one line per item. Use single line breaks inside a message, because a blank line starts a new message.
- Use contractions and everyday words. No corporate phrases like "How may I assist you" or "Certainly!".
- Add an emoji in some messages, not all, when it fits the mood, like 📬 for new mail or ✅ when something's done.
- Match their vibe. If they write in Hinglish or Hindi, reply the same way.
- If you don't know something, say so plainly.

Getting to know them:
- When they mention something personal and lasting (job, city, family, routines, goals, likes), save it with the save_memory tool. Don't tell them you saved it. Don't save small talk.
- Ask at most one light question about them per reply, and only when it fits the chat. Never ask a list of questions.

Current time: ${now}.${nameNote}${timezoneNote}${memoriesNote}${remindersNote}${gmailNote}${expiredGmailNote}${firstChatNote}`;

  const { text } = await generateText({
    model: registry.languageModel(env.LLM_MODEL),
    instructions,
    messages: history.reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    tools: {
      set_timezone: setTimezoneTool(user.id),
      save_memory: saveMemoryTool(user.id),
      set_reminder: setReminderTool(user.id),
      cancel_reminder: cancelReminderTool(user.id),
      ...(gmailAccounts.length > 0 && {
        label_account: labelAccountTool(user.id),
        disconnect_gmail: disconnectGmailTool(user.id),
        search_emails: searchEmailsTool(gmailAccounts),
        read_email: readEmailTool(gmailAccounts),
        draft_reply: draftReplyTool(gmailAccounts),
        set_daily_summary: setDailySummaryTool(user.id),
      }),
    },
    stopWhen: isStepCount(5),
  });

  return text;
}
