import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  LLM_MODEL: z.templateLiteral([z.enum(['openai']), ':', z.string()]),
  OPENAI_API_KEY: z.string().min(1),
});

export const env = envSchema.parse(process.env);
