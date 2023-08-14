// See: database_schema.sql

import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  normalizedUsername: text("normalized_username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  lastIP: text("last_ip").notNull(),
  datetimeCreated: timestamp("datetime_created", { withTimezone: true })
    .notNull()
    .defaultNow(),
  datetimeLastLogin: timestamp("datetime_last_login", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// TODO: other tables

export const chatLogTable = pgTable("chat_log", {
  id: serial("id").primaryKey(),
  userID: integer("user_id").notNull(),
  discordName: text("discord_name"),
  message: text("message").notNull(),
  room: text("room").notNull(),
  username: text("username").notNull().unique(),
  normalizedUsername: text("normalized_username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  lastIP: text("last_ip").notNull(),
  datetimeSent: timestamp("datetime_sent", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
