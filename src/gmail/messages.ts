import type { gmail_v1 } from '@googleapis/gmail';
import { GmailAccessExpiredError, withGmail, type GmailAccount } from './client';

const MAX_BODY_LENGTH = 10000;

export function findAccount(accounts: GmailAccount[], account: string) {
  const wanted = account.toLowerCase();
  return accounts.find((a) => a.email.toLowerCase() === wanted || a.label?.toLowerCase() === wanted);
}

export async function searchEmails(accounts: GmailAccount[], query: string, maxResults: number) {
  const expired: string[] = [];
  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        return await withGmail(account, () => searchAccount(account, query, maxResults));
      } catch (error) {
        if (!(error instanceof GmailAccessExpiredError)) throw error;
        expired.push(error.email);
        return [];
      }
    }),
  );

  return { emails: results.flat(), expired };
}

async function searchAccount({ email, gmail }: GmailAccount, query: string, maxResults: number) {
  const { data } = await gmail.users.messages.list({ userId: 'me', q: query, maxResults });
  return Promise.all(
    (data.messages ?? []).map(async ({ id }) => {
      const { data: message } = await gmail.users.messages.get({
        userId: 'me',
        id: id!,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      return {
        account: email,
        id: message.id,
        from: header(message, 'From'),
        subject: header(message, 'Subject'),
        date: header(message, 'Date'),
        snippet: message.snippet,
        unread: message.labelIds?.includes('UNREAD') ?? false,
        important: message.labelIds?.includes('IMPORTANT') ?? false,
      };
    }),
  );
}

export function header(message: gmail_v1.Schema$Message, name: string) {
  return message.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}

export function bodyText(part: gmail_v1.Schema$MessagePart | undefined) {
  const text = findPart(part, 'text/plain') ?? stripHtml(findPart(part, 'text/html') ?? '');
  return text.slice(0, MAX_BODY_LENGTH);
}

function findPart(part: gmail_v1.Schema$MessagePart | undefined, mimeType: string): string | null {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

function stripHtml(html: string) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
