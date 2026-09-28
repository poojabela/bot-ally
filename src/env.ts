import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  LLM_MODEL: z.templateLiteral([z.enum(['openai']), ':', z.string()]),
  OPENAI_API_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  PUBLIC_URL: z.url(),
  PORT: z.coerce.number().default(3000),
  TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'must be 32 bytes as hex'),
  OAUTH_STATE_SECRET: z.string().min(32),
});

export const env = envSchema.parse(process.env);
