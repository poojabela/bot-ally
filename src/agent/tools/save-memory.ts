import { openai } from '@ai-sdk/openai';
import { embed, tool } from 'ai';
import { z } from 'zod';
import { db } from '../../db/client';
import { memories } from '../../db/schema';

export function saveMemoryTool(userId: string) {
  return tool({
    description:
      'Save a lasting fact about the user, like their job, city, family, routines, goals, or likes. One short fact per call.',
    inputSchema: z.object({
      content: z.string().describe('One short fact, for example "works as a nurse in Pune"'),
    }),
    execute: async ({ content }) => {
      const { embedding } = await embed({ model: openai.embedding('text-embedding-3-small'), value: content });
      await db.insert(memories).values({ userId, content, embedding });
      return { saved: content };
    },
  });
}
