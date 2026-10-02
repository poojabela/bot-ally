import { tool } from 'ai';
import { z } from 'zod';
import { GmailAccessExpiredError, withGmail, type GmailAccount } from '../../../gmail/client';
import { findAccount, header } from '../../../gmail/messages';

export function draftReplyTool(accounts: GmailAccount[]) {
  return tool({
    description: 'Save a reply to one email as a Gmail draft. They review and send it from Gmail.',
    inputSchema: z.object({
      account: z.string().describe('The account the email is in, from search_emails'),
      id: z.string().describe('The id of the email to reply to'),
      body: z.string().describe('Plain text reply, no markdown'),
    }),
    execute: async ({ account, id, body }) => {
      const selected = findAccount(accounts, account);
      if (!selected) return { error: `No connected account ${account}` };

      try {
        const { data: original } = await withGmail(selected, () =>
          selected.gmail.users.messages.get({
            userId: 'me',
            id,
            format: 'metadata',
            metadataHeaders: ['From', 'Reply-To', 'Subject', 'Message-ID', 'References'],
          }),
        );
        const to = header(original, 'Reply-To') ?? header(original, 'From');
        if (!to) return { error: 'Could not find who to reply to' };

        const originalSubject = header(original, 'Subject') ?? '';
        const subject = /^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`;
        const messageId = header(original, 'Message-ID');
        const references = [header(original, 'References'), messageId].filter(Boolean).join(' ');

        const raw = [
          `To: ${to}`,
          `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
          ...(messageId ? [`In-Reply-To: ${messageId}`, `References: ${references}`] : []),
          'Content-Type: text/plain; charset=UTF-8',
          '',
          body,
        ].join('\r\n');

        await withGmail(selected, () =>
          selected.gmail.users.drafts.create({
            userId: 'me',
            requestBody: { message: { raw: Buffer.from(raw).toString('base64url'), threadId: original.threadId } },
          }),
        );
        return { drafted: { to, subject } };
      } catch (error) {
        if (!(error instanceof GmailAccessExpiredError)) throw error;
        return { error: `Gmail access for ${error.email} expired. Tell them and send the connect link so they can reconnect it.` };
      }
    },
  });
}
