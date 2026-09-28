import { pgTable, timestamp, pgEnum, varchar, uuid, jsonb, index, vector, uniqueIndex } from "drizzle-orm/pg-core";

export const messageRole = pgEnum("message_role", ["user", "assistant", "tool"]);
export const scheduledTaskKind = pgEnum("scheduled_task_kind", ["reminder", "inbox_summary"]);
export const connectionStatus = pgEnum("connection_status", ["pending", "active", "revoked", "error"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  chat_id: varchar("chat_id").unique().notNull(),
  name: varchar("name"),
  timezone: varchar("timezone"),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: messageRole('role').notNull(),
    content: varchar('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_user_id_created_at_idx").on(t.userId, t.createdAt.desc())],
);

export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    content: varchar('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index('memories_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops'))],
);

export const scheduled_tasks = pgTable("scheduled_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  task: varchar("task").notNull(),
  kind: scheduledTaskKind("kind").notNull().default("reminder"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
},
(t) => [index("scheduled_tasks_user_id_scheduled_at_idx").on(t.userId, t.scheduledAt.desc())]
);

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider').notNull(),
    externalAccountId: varchar('external_account_id').notNull(),
    credentialsEncrypted: varchar('credentials_encrypted'),
    scopes: varchar('scopes').array(),
    status: connectionStatus('status').notNull().default('pending'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('connections_user_provider_account_idx').on(t.userId, t.provider, t.externalAccountId)],
);