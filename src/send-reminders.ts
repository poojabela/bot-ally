import TelegramBot from 'node-telegram-bot-api';
import { db } from './db/client';
import { env } from './env';
import { sendDueReminders } from './reminders';

const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: false });

try {
  await sendDueReminders(bot);
} finally {
  await db.$client.end();
}
