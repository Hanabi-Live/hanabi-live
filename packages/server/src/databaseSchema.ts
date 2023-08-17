// See: database_schema.sql

import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const usersTable = pgTable("users", {
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

// TODO: user_settings

// TODO: user_stats

// TODO: user_friends

// TODO: user_reverse_friends

// TODO: games

// TODO: game_participants

// TODO: game_participant_notes

// TODO: game_actions

// TODO: game_tags

// TODO: variant_stats

export const chatLogTable = pgTable(
  "chat_log",
  {
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
  },
  (table) => ({
    chatLogIndexUserID: index("chat_log_index_user_id").on(table.userID),
    chatLogIndexRoom: index("chat_log_index_room").on(table.room),
    chatLogDatetimeSentID: index("chat_log_datetime_sent_id").on(
      table.datetimeSent,
      table.id,
    ),
  }),
);

export const chatLogPMTable = pgTable(
  "chat_log_pm",
  {
    id: serial("id").primaryKey(),
    userID: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    message: text("message").notNull(),
    recipientID: integer("recipient_id").notNull(),
    datetimeSent: timestamp("datetime_sent", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    chatLogPMIndexUserID: index("chat_log_pm_index_user_id").on(table.userID),
    chatLogPMIndexRecipientID: index("chat_log_pm_index_recipient_id").on(
      table.recipientID,
    ),
    chatLogPMIndexDatetimeSentID: index(
      "chat_log_pm_index_datetime_sent_id",
    ).on(table.datetimeSent, table.id),
  }),
);

export const bannedIPsTable = pgTable("banned_ips", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),

  /** `DEFAULT NULL` is the default behavior. */
  userID: integer("user_id").references(() => usersTable.id),

  /** `DEFAULT NULL` is the default behavior. */
  reason: text("reason"),

  datetimeBanned: timestamp("datetime_banned", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const mutedIPsTable = pgTable("muted_ips", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),

  /** `DEFAULT NULL` is the default behavior. */
  userID: integer("user_id").references(() => usersTable.id),

  /** `DEFAULT NULL` is the default behavior. */
  reason: text("reason"),

  datetimeBanned: timestamp("datetime_banned", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
