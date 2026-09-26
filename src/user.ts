import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { users } from "./db/schema";

export async function findOrCreateUser(chatId: string, name?: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.chat_id, chatId),
  });
  if (!user) {
    const [newUser] = await db.insert(users).values({
      chat_id: chatId,
      name,
    })
    .onConflictDoUpdate({
      target: users.chat_id,
      set: {
        chat_id: chatId,
      },
    })
    .returning();
    return newUser;
  }
  return user;
}