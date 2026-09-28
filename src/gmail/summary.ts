import { generateText, isStepCount } from 'ai';
import { registry } from '../agent/model';
import { readEmailTool } from '../agent/tools/gmail/read-email';
import type { users } from '../db/schema';
import { env } from '../env';
import { startOfLocalDay } from '../time';
import { getGmailAccounts } from './client';
import { searchEmails } from './messages';

export async function summarizeInbox(user: typeof users.$inferSelect) {
  const accounts = await getGmailAccounts(user.id);
  if (accounts.length === 0) return null;

  const since = Math.floor(startOfLocalDay(new Date(), user.timezone ?? 'UTC').getTime() / 1000);
  const emails = await searchEmails(accounts, `after:${since}`, 25);

  const { text } = await generateText({
    model: registry.languageModel(env.LLM_MODEL),
    instructions: `You're Ally, the user's Gmail assistant on Telegram. Write their daily inbox summary for today.
- Casual and lowercase, like texting a friend.${user.name ? ` Their name is ${user.name.toLowerCase()}.` : ''}
- Important and unread emails first. One line per email or group of similar emails, each starting with "• ". Skip newsletters and promos unless there are only a few emails.
- Use single line breaks, never blank lines.
- One emoji at most.
- If there are no emails, just say it was a quiet day, like "quiet day, nothing new 📭".
- Use read_email only when a snippet is not enough to tell what an email is about.`,
    prompt: `Today's emails:\n${JSON.stringify(emails)}`,
    tools: { read_email: readEmailTool(accounts) },
    stopWhen: isStepCount(3),
  });

  return text;
}
