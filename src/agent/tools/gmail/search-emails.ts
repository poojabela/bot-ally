import { tool } from 'ai';
import { z } from 'zod';
import type { GmailAccount } from '../../../gmail/client';
import { findAccount, searchEmails } from '../../../gmail/messages';

export function searchEmailsTool(accounts: GmailAccount[]) {
  return tool({
    description: 'Search their Gmail. Returns sender, subject, date and a short snippet for each email.',
    inputSchema: z.object({
      query: z
        .string()
        .describe('Gmail search syntax, for example "newer_than:1d", "is:unread is:important" or "from:amazon subject:order"'),
      account: z.string().optional().describe('Email or label of one connected account. Leave out to search all accounts'),
      maxResults: z.number().int().min(1).max(25).default(10),
    }),
    execute: async ({ query, account, maxResults }) => {
      const selected = account ? findAccount(accounts, account) : undefined;
      if (account && !selected) return { error: `No connected account ${account}` };

      const { emails, expired } = await searchEmails(selected ? [selected] : accounts, query, maxResults);
      if (expired.length === 0) return { emails };
      return { emails, expired, note: 'Gmail access expired for these accounts. Tell them and send the connect link so they can reconnect.' };
    },
  });
}
