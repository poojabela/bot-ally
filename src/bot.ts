import TelegramBot from 'node-telegram-bot-api';
import { runAgent } from './agent/run';
import { db } from './db/client';
import { messages } from './db/schema';
import { startServer } from './server';
import { toTelegramHtml } from './telegram';
import { findOrCreateUser } from './user';
import { env } from './env';


const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true });

startServer(bot);

bot.on('message', async (msg) => {
  const text = msg.text;
  if (!text) return;
  if (text.startsWith('/') && text !== '/start') return;

  bot.sendChatAction(msg.chat.id, 'typing');
  const typing = setInterval(() => bot.sendChatAction(msg.chat.id, 'typing'), 4000);

  try {
    const user = await findOrCreateUser(msg.chat.id.toString(), msg.from?.first_name);
    await db.insert(messages).values({ userId: user.id, role: 'user', content: text });

    const reply = await runAgent(user);
    const parts = reply.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) console.error('Empty reply from agent');

    for (const part of parts) {
      await bot.sendChatAction(msg.chat.id, 'typing');
      await new Promise((resolve) => setTimeout(resolve, Math.min(part.length * 30, 2000)));
      await bot.sendMessage(msg.chat.id, toTelegramHtml(part), { parse_mode: 'HTML' });
      await db.insert(messages).values({ userId: user.id, role: 'assistant', content: part });
    }
  } catch (error) {
    console.error(error);
    await bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Try again.');
  } finally {
    clearInterval(typing);
  }
});
