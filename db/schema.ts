// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const bookings=sqliteTable("bookings",{id:integer("id").primaryKey({autoIncrement:true}),name:text("name").notNull(),phone:text("phone").notNull(),packageName:text("package_name").notNull(),startingPrice:integer("starting_price").notNull(),deposit:integer("deposit").notNull(),paymentMethod:text("payment_method").notNull(),placement:text("placement").notNull(),date:text("date").notNull(),time:text("time").notNull(),idea:text("idea").notNull(),status:text("status").notNull().default("new"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const chatMessages=sqliteTable("chat_messages",{id:integer("id").primaryKey({autoIncrement:true}),conversationId:text("conversation_id").notNull(),sender:text("sender").notNull(),body:text("body").notNull(),telegramMessageId:integer("telegram_message_id"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const reviews=sqliteTable("reviews",{id:integer("id").primaryKey({autoIncrement:true}),name:text("name").notNull(),rating:integer("rating").notNull(),comment:text("comment").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
