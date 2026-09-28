import { gmail } from '@googleapis/gmail';
import { eq } from 'drizzle-orm';
import { createServer } from 'node:http';
import type TelegramBot from 'node-telegram-bot-api';
import { encrypt, verifyState } from './crypto';
import { db } from './db/client';
import { connections, messages, users } from './db/schema';
import { env } from './env';
import { createOAuthClient, GMAIL_SCOPES } from './gmail/oauth';

export function startServer(bot: TelegramBot) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', env.PUBLIC_URL);
    const send = (status: number, body: string) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(body);
    };

    try {
      if (url.pathname === '/auth/google') {
        const state = url.searchParams.get('state') ?? '';
        if (!verifyState(state)) return send(400, 'This link has expired. Ask Ally for a new one.');

        const authUrl = createOAuthClient().generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: GMAIL_SCOPES,
          state,
        });
        res.writeHead(302, { Location: authUrl });
        return res.end();
      }

      if (url.pathname === '/auth/google/callback') {
        const userId = verifyState(url.searchParams.get('state') ?? '');
        const code = url.searchParams.get('code');
        if (!userId) return send(400, 'This link has expired. Ask Ally for a new one.');
        if (!code) return send(400, 'Gmail was not connected. You can close this tab.');

        const auth = createOAuthClient();
        const { tokens } = await auth.getToken(code);
        if (!tokens.refresh_token) return send(400, 'Google did not return a refresh token. Try connecting again.');
        auth.setCredentials(tokens);

        const { data: profile } = await gmail({ version: 'v1', auth }).users.getProfile({ userId: 'me' });
        const email = profile.emailAddress!;

        await db
          .insert(connections)
          .values({
            userId,
            provider: 'google',
            externalAccountId: email,
            credentialsEncrypted: encrypt(tokens.refresh_token),
            scopes: GMAIL_SCOPES,
            status: 'active',
          })
          .onConflictDoUpdate({
            target: [connections.userId, connections.provider, connections.externalAccountId],
            set: { credentialsEncrypted: encrypt(tokens.refresh_token), scopes: GMAIL_SCOPES, status: 'active' },
          });

        const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (user) {
          const content = `${email} is connected. is this your work or personal email?`;
          await bot.sendMessage(user.chat_id, content);
          await db.insert(messages).values({ userId, role: 'assistant', content });
        }
        return send(200, 'Gmail connected. You can close this tab and go back to Telegram.');
      }

      send(404, 'Not found');
    } catch (error) {
      console.error(error);
      send(500, 'Something went wrong. Try connecting again.');
    }
  });

  server.listen(env.PORT, () => console.log(`Server listening on ${env.PORT}`));
}
