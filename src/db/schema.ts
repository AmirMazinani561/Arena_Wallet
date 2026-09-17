/**
 * تعریف ساختار جداول برای ابزار drizzle-kit (محیط توسعه با PostgreSQL).
 *
 * توجه: در زمان اجرا، برنامه از لایه اتصال دوگانه (src/db/client.ts و src/db/repo.ts)
 * استفاده می‌کند که جداول را در صورت نبود، به صورت خودکار روی MySQL یا PostgreSQL می‌سازد.
 * بنابراین برای استقرار روی هاست نیازی به اجرای drizzle-kit نیست.
 */
import { pgTable, varchar, text, timestamp, boolean, doublePrecision, integer, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  username: varchar("username", { length: 150 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: varchar("full_name", { length: 191 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    // bank | cash | person | income | expense
    type: varchar("type", { length: 20 }).notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    initialBalance: doublePrecision("initial_balance").default(0).notNull(),
    // تیک نمایش در صفحه اصلی
    isFavorite: boolean("is_favorite").default(false).notNull(),
    // سرفصل اصلی یا زیرمجموعه (فقط برای درآمد و هزینه)
    isParent: boolean("is_parent").default(false).notNull(),
    parentId: varchar("parent_id", { length: 64 }),
    detailInfo: text("detail_info"),
    icon: varchar("icon", { length: 64 }),
    color: varchar("color", { length: 32 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_acc_type").on(t.type),
    index("idx_acc_parent").on(t.parentId),
    index("idx_acc_fav").on(t.isFavorite),
    index("idx_acc_sort_order").on(t.sortOrder),
  ]
);

export const transactions = pgTable(
  "transactions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    // expense | income | transfer — به صورت خودکار از مبدا و مقصد تعیین می‌شود
    type: varchar("type", { length: 20 }).notNull(),
    amount: doublePrecision("amount").notNull(),
    // کارمزد بانکی (فقط زمانی که مبدا حساب بانکی است)
    fee: doublePrecision("fee").default(0).notNull(),
    fromAccountId: varchar("from_account_id", { length: 64 }).notNull(),
    toAccountId: varchar("to_account_id", { length: 64 }).notNull(),
    date: timestamp("date").notNull(),
    shamsiDate: varchar("shamsi_date", { length: 12 }).notNull(),
    description: text("description"),
    trackingNumber: varchar("tracking_number", { length: 120 }),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    sourceHash: varchar("source_hash", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_tx_shamsi_date").on(t.shamsiDate),
    index("idx_tx_date").on(t.date),
    index("idx_tx_date_created").on(t.date, t.createdAt),
    index("idx_tx_from").on(t.fromAccountId),
    index("idx_tx_to").on(t.toAccountId),
    index("idx_tx_type").on(t.type),
    index("idx_tx_status_date").on(t.status, t.date),
    index("idx_tx_source_hash").on(t.sourceHash),
    index("idx_tx_from_flow").on(t.fromAccountId, t.amount, t.fee),
    index("idx_tx_to_flow").on(t.toAccountId, t.amount),
  ]
);

export const smsPatterns = pgTable(
  "sms_patterns",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    accountId: varchar("account_id", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 20 }).notNull(),
    sampleText: text("sample_text").notNull(),
    bankName: varchar("bank_name", { length: 191 }),
    cardLast4: varchar("card_last4", { length: 16 }),
    keywords: text("keywords"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_sms_pat_account").on(t.accountId),
  ]
);

