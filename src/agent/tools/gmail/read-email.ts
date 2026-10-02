import { tool } from 'ai';
import { z } from 'zod';
import { GmailAccessExpiredError, withGmail, type GmailAccount } from '../../../gmail/client';
import { bodyText, findAccount, header } from '../../../gmail/messages';

export function readEmailTool(accounts: GmailAccount[]) {
  return tool({
    description: 'Read the full text of one email, for example to summarize it or reply to it.',
    inputSchema: z.object({
      account: z.string().describe('The account the email is in, from search_emails'),
      id: z.string().describe('The email id from search_emails'),
    }),
    execute: async ({ account, id }) => {
      const selected = findAccount(accounts, account);
      if (!selected) return { error: `No connected account ${account}` };

      try {
        const { data: message } = await withGmail(selected, () => selected.gmail.users.messages.get({ userId: 'me', id, format: 'full' }));
        return {
          from: header(message, 'From'),
          to: header(message, 'To'),
          subject: header(message, 'Subject'),
          date: header(message, 'Date'),
          body: bodyText(message.payload),
        };
      } catch (error) {
        if (!(error instanceof GmailAccessExpiredError)) throw error;
        return { error: `Gmail access for ${error.email} expired. Tell them and send the connect link so they can reconnect it.` };
      }
    },
  });
}
