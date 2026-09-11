import {
  query,
  execute,
  dialect,
  boolParam,
  readBool,
  readNumber,
  castToText,
} from "./client";
import { hashPassword } from "@/lib/auth-utils";
import { toShamsiDateString } from "@/lib/date-utils";
import {
  PENDING_EXPENSE_CATEGORY_ID,
  PENDING_INCOME_CATEGORY_ID,
} from "@/lib/pending-categories";
import crypto from "crypto";

export const BANK_FEE_CATEGORY_ID = "cat_exp_bank_fee";

// بازصادر برای سازگاری با واردکننده‌های فعلی (API ها)؛ مقدارها در pending-categories تعریف شده‌اند
export { PENDING_EXPENSE_CATEGORY_ID, PENDING_INCOME_CATEGORY_ID };

/* ------------------------------------------------------------------ */
/*  انواع داده                                                          */
/* ------------------------------------------------------------------ */

export interface AccountRow {
  id: string;
  type: string;
  name: string;
  initialBalance: number;
  isFavorite: boolean;
  isParent: boolean;
  parentId: string | null;
  detailInfo: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
}

export interface TransactionRow {
  id: string;
  type: string;
  amount: number;
  fee: number;
  fromAccountId: string;
  toAccountId: string;
  date: string;
  shamsiDate: string;
  description: string | null;
  trackingNumber: string | null;
  /** وضعیت تراکنش: active یا pending (در انتظار تکمیل از پیامک) */
  status: string;
  /** هش متن پیامک مبدأ (برای تشخیص تکراری) */
  sourceHash: string | null;
}

/* ------------------------------------------------------------------ */
/*  ساخت خودکار جداول و ایندکس‌ها                                       */
/* ------------------------------------------------------------------ */

const DDL_MYSQL = [
  `CREATE TABLE IF NOT EXISTS users (
     id varchar(64) NOT NULL PRIMARY KEY,
     username varchar(150) NOT NULL UNIQUE,
     password_hash text NOT NULL,
     full_name varchar(191) NULL,
     created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS accounts (
     id varchar(64) NOT NULL PRIMARY KEY,
     type varchar(20) NOT NULL,
     name varchar(191) NOT NULL,
     initial_balance double NOT NULL DEFAULT 0,
     is_favorite tinyint(1) NOT NULL DEFAULT 0,
     is_parent tinyint(1) NOT NULL DEFAULT 0,
     parent_id varchar(64) NULL,
     detail_info text NULL,
     icon varchar(64) NULL,
     color varchar(32) NULL,
     created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS transactions (
     id varchar(64) NOT NULL PRIMARY KEY,
     type varchar(20) NOT NULL,
     amount double NOT NULL,
     fee double NOT NULL DEFAULT 0,
     from_account_id varchar(64) NOT NULL,
     to_account_id varchar(64) NOT NULL,
     date datetime NOT NULL,
     shamsi_date varchar(12) NOT NULL,
     description text NULL,
     tracking_number varchar(120) NULL,
     created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS backup_snapshots (
     id varchar(64) NOT NULL PRIMARY KEY,
     created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
     shamsi_date varchar(12) NOT NULL,
     source varchar(20) NOT NULL DEFAULT 'auto',
     account_count int NOT NULL DEFAULT 0,
     transaction_count int NOT NULL DEFAULT 0,
     payload longtext NOT NULL
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const DDL_POSTGRES = [
  `CREATE TABLE IF NOT EXISTS users (
     id varchar(64) PRIMARY KEY,
     username varchar(150) NOT NULL UNIQUE,
     password_hash text NOT NULL,
     full_name varchar(191),
     created_at timestamp NOT NULL DEFAULT now(),
     updated_at timestamp NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS accounts (
     id varchar(64) PRIMARY KEY,
     type varchar(20) NOT NULL,
     name varchar(191) NOT NULL,
     initial_balance double precision NOT NULL DEFAULT 0,
     is_favorite boolean NOT NULL DEFAULT false,
     is_parent boolean NOT NULL DEFAULT false,
     parent_id varchar(64),
     detail_info text,
     icon varchar(64),
     color varchar(32),
     created_at timestamp NOT NULL DEFAULT now(),
     updated_at timestamp NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS transactions (
     id varchar(64) PRIMARY KEY,
     type varchar(20) NOT NULL,
     amount double precision NOT NULL,
     fee double precision NOT NULL DEFAULT 0,
     from_account_id varchar(64) NOT NULL,
     to_account_id varchar(64) NOT NULL,
     date timestamp NOT NULL,
     shamsi_date varchar(12) NOT NULL,
     description text,
     tracking_number varchar(120),
     created_at timestamp NOT NULL DEFAULT now(),
     updated_at timestamp NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS backup_snapshots (
     id varchar(64) PRIMARY KEY,
     created_at timestamp NOT NULL DEFAULT now(),
     shamsi_date varchar(12) NOT NULL,
     source varchar(20) NOT NULL DEFAULT 'auto',
     account_count integer NOT NULL DEFAULT 0,
     transaction_count integer NOT NULL DEFAULT 0,
     payload text NOT NULL
   )`,
];

/**
 * ایندکس‌های عملکردی: مهم‌ترین عامل جلوگیری از افت سرعت با رشد داده‌ها.
 * بدون این ایندکس‌ها، با چند ده هزار تراکنش گزارش‌گیری کند می‌شود.
 */
const INDEXES: { name: string; table: string; columns: string }[] = [
  { name: "idx_tx_shamsi_date", table: "transactions", columns: "shamsi_date" },
  { name: "idx_tx_date", table: "transactions", columns: "date" },
  { name: "idx_tx_from", table: "transactions", columns: "from_account_id" },
  { name: "idx_tx_to", table: "transactions", columns: "to_account_id" },
  { name: "idx_tx_type", table: "transactions", columns: "type" },
  { name: "idx_acc_type", table: "accounts", columns: "type" },
  { name: "idx_acc_parent", table: "accounts", columns: "parent_id" },
  { name: "idx_acc_fav", table: "accounts", columns: "is_favorite" },
];

async function ensureIndexes() {
  for (const idx of INDEXES) {
    try {
      if (dialect === "postgres") {
        await execute(
          `CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table} (${idx.columns})`
        );
      } else {
        // MySQL از IF NOT EXISTS برای ایندکس پشتیبانی نمی‌کند
        const existing = await query<{ c: number }>(
          `SELECT COUNT(*) AS c FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
          [idx.table, idx.name]
        );
        if (readNumber(existing[0]?.c) === 0) {
          await execute(`CREATE INDEX ${idx.name} ON ${idx.table} (${idx.columns})`);
        }
      }
    } catch {
      // اگر ایندکس قابل ساخت نبود، عملکرد برنامه مختل نمی‌شود
    }
  }
}

/** افزودن ستون‌هایی که ممکن است در نسخه‌های قدیمی وجود نداشته باشند */
/**
 * افزودن ایمن یک ستون در صورت نبود (فقط ADD COLUMN — هیچ داده‌ای تغییر نمی‌کند)
 */
async function ensureColumn(table: string, column: string, pgDef: string, myDef: string) {
  try {
    if (dialect === "postgres") {
      await execute(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${pgDef}`);
    } else {
      const cols = await query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, column]
      );
      if (readNumber(cols[0]?.c) === 0) {
        await execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${myDef}`);
      }
    }
  } catch {
    /* بی‌اهمیت */
  }
}

/** ستون‌هایی که در نسخه‌های بعدی اضافه شده‌اند */
async function ensureColumns() {
  await ensureColumn("transactions", "fee", "double precision NOT NULL DEFAULT 0", "double NOT NULL DEFAULT 0");
  await ensureColumn("accounts", "sort_order", "integer NOT NULL DEFAULT 0", "int NOT NULL DEFAULT 0");
  // وضعیت تراکنش: active (کامل) یا pending (ثبت‌شده از پیامک، در انتظار تکمیل طرف دوم)
  await ensureColumn("transactions", "status", "varchar(20) NOT NULL DEFAULT 'active'", "varchar(20) NOT NULL DEFAULT 'active'");
  // هش متن پیامک برای جلوگیری از ثبت تکراری
  await ensureColumn("transactions", "source_hash", "varchar(64) NULL", "varchar(64) NULL");
}

let bootstrapPromise: Promise<void> | null = null;
let bootstrapDone = false;

/**
 * بررسی سریع آماده بودن دیتابیس.
 * در محیط سرورلس (Vercel) هر درخواست ممکن است روی نمونه‌ای تازه اجرا شود؛
 * با این بررسی سبک، از اجرای بی‌مورد دستورات ساخت جدول جلوگیری می‌شود.
 */
async function isAlreadyInitialized(): Promise<boolean> {
  try {
    const rows = await query<{ c: number }>(`SELECT COUNT(*) AS c FROM accounts`);
    return readNumber(rows[0]?.c) > 0;
  } catch {
    return false;
  }
}

/** ساخت جداول، ایندکس‌ها و داده‌های اولیه (فقط یک بار در هر اجرا) */
export function ensureDatabase(): Promise<void> {
  if (bootstrapDone) return Promise.resolve();
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      // مسیر سریع: اگر جداول اصلی از قبل ساخته شده‌اند، فقط جداول جدید (در صورت نبود) اضافه می‌شوند
      if (await isAlreadyInitialized()) {
        const statements = dialect === "mysql" ? DDL_MYSQL : DDL_POSTGRES;
        const snapshotDdl = statements.find((s) => s.includes("backup_snapshots"));
        if (snapshotDdl) {
          try {
            await execute(snapshotDdl);
          } catch {
            /* نادیده گرفته می‌شود */
          }
        }
        // ستون‌های افزوده‌شده در نسخه‌های جدید (فقط ADD COLUMN — بدون تغییر داده)
        await ensureColumns();
        await ensureSystemCategories();
        bootstrapDone = true;
        return;
      }

      const statements = dialect === "mysql" ? DDL_MYSQL : DDL_POSTGRES;
      for (const stmt of statements) {
        await execute(stmt);
      }
      await ensureColumns();
      await ensureIndexes();
      await seedInitialData();
      await ensureSystemCategories();
    })()
      .then(() => {
        bootstrapDone = true;
      })
      .catch((err) => {
        bootstrapPromise = null;
        throw err;
      });
  }
  return bootstrapPromise;
}

/* ------------------------------------------------------------------ */
/*  داده‌های اولیه                                                      */
/* ------------------------------------------------------------------ */

/**
 * درج ایمن: اگر رکورد از قبل موجود باشد (مثلاً در اثر اجرای همزمان چند
 * نمونه سرورلس)، خطای کلید تکراری نادیده گرفته می‌شود.
 */
async function insertIfAbsent(sqlText: string, params: unknown[]) {
  try {
    await execute(sqlText, params);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    const isDuplicate =
      msg.includes("duplicate") || msg.includes("unique") || msg.includes("already exists");
    if (!isDuplicate) throw err;
  }
}

async function seedInitialData() {
  const userCount = await query<{ c: number }>(`SELECT COUNT(*) AS c FROM users`);
  if (readNumber(userCount[0]?.c) === 0) {
    await insertIfAbsent(
      `INSERT INTO users (id, username, password_hash, full_name) VALUES (?, ?, ?, ?)`,
      ["user_admin", "admin", hashPassword("123456"), "مدیر کیف پول"]
    );
  }

  const accCount = await query<{ c: number }>(`SELECT COUNT(*) AS c FROM accounts`);
  if (readNumber(accCount[0]?.c) === 0) {
    const seedAccounts: [string, string, string, number, boolean, boolean, string | null, string | null][] =
      [
        ["acc_bank_blu", "bank", "بلو بانک (سامان)", 245000000, true, false, null, "کارت: ۶۲۱۹-۸۶۱۰-۴۳۱۲-۹۰۲۳"],
        ["acc_bank_mellat", "bank", "بانک ملت", 580000000, true, false, null, "حساب: ۴۷۸۸-۹۰۱-۱۲"],
        ["acc_cash_main", "cash", "صندوق / کیف نقدی", 42000000, true, false, null, "وجوه نقد در دسترس"],
        ["acc_person_reza", "person", "رضا محمدی (طرف حساب)", 50000000, true, false, null, "۰۹۱۲۳۴۵۶۷۸۹"],
        ["acc_person_sherkat", "person", "شرکت بازرگانی فردا", -120000000, false, false, null, "۰۲۱-۸۸۹۹۰۰۱۱"],

        ["cat_exp_car", "expense", "هزینه‌های خودرو و حمل و نقل", 0, true, true, null, null],
        ["cat_exp_food", "expense", "خوراک و لوازم مصرفی", 0, true, true, null, null],
        ["cat_exp_home", "expense", "مسکن، قبوض و اشتراک", 0, false, true, null, null],

        ["cat_sub_fuel", "expense", "بنزین و گاز", 0, false, false, "cat_exp_car", null],
        ["cat_sub_car_repair", "expense", "تعمیرات و تعویض روغن", 0, false, false, "cat_exp_car", null],
        ["cat_sub_snapp", "expense", "اسنپ و تاکسی اینترنتی", 0, false, false, "cat_exp_car", null],
        ["cat_sub_grocery", "expense", "خرید سوپرمارکت و مواد غذایی", 0, false, false, "cat_exp_food", null],
        ["cat_sub_cafe", "expense", "رستوران، فست‌فود و کافه", 0, false, false, "cat_exp_food", null],
        ["cat_sub_rent", "expense", "اجاره و شارژ ساختمان", 0, false, false, "cat_exp_home", null],
        ["cat_sub_internet", "expense", "اینترنت و بسته مکالمه", 0, false, false, "cat_exp_home", null],

        ["cat_inc_salary", "income", "حقوق و دستمزد ماهانه", 0, true, true, null, null],
        ["cat_inc_business", "income", "درآمدهای تجاری و پروژه‌ای", 0, false, true, null, null],
        ["cat_sub_fixed_salary", "income", "حقوق ثابت", 0, false, false, "cat_inc_salary", null],
        ["cat_sub_bonus", "income", "پاداش و اضافه کاری", 0, false, false, "cat_inc_salary", null],
        ["cat_sub_freelance", "income", "پروژه‌های طراحی و مشاوره", 0, false, false, "cat_inc_business", null],
      ];

    for (const [id, type, name, bal, fav, parent, parentId, detail] of seedAccounts) {
      await insertIfAbsent(
        `INSERT INTO accounts (id, type, name, initial_balance, is_favorite, is_parent, parent_id, detail_info)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, type, name, bal, boolParam(fav), boolParam(parent), parentId, detail]
      );
    }

    const now = new Date();
    const day = (offset: number) => new Date(now.getTime() - offset * 86400000);
    const seedTx: [string, string, number, number, string, string, Date, string | null][] = [
      ["tx_1", "income", 320000000, 0, "cat_sub_fixed_salary", "acc_bank_blu", day(8), "واریز حقوق پایه ماه جاری"],
      ["tx_2", "expense", 4500000, 12000, "acc_bank_blu", "cat_sub_fuel", day(4), "بنزین سوپر جایگاه ۷۲"],
      ["tx_3", "expense", 18500000, 7200, "acc_bank_blu", "cat_sub_grocery", day(2), "خرید مایحتاج هفتگی سوپرمارکت"],
      ["tx_4", "transfer", 30000000, 25000, "acc_bank_mellat", "acc_cash_main", day(0), "برداشت نقدی از خودپرداز"],
    ];

    for (const [id, type, amount, fee, from, to, d, desc] of seedTx) {
      await insertIfAbsent(
        `INSERT INTO transactions (id, type, amount, fee, from_account_id, to_account_id, date, shamsi_date, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, type, amount, fee, from, to, d, toShamsiDateString(d), desc]
      );
    }
  }

  // سرفصل‌های سیستمی در ensureSystemCategories ساخته می‌شوند
  // (هم روی دیتابیس تازه و هم روی دیتابیس‌های موجود اجرا می‌شود)
}

/**
 * سرفصل‌های سیستمی: کارمزد بانکی + دسته‌بندی موقت پیامک‌ها.
 * این تابع idempotent است و در هر بوت (حتی روی دیتابیس‌های موجود) اجرا می‌شود.
 */
async function ensureSystemCategories() {
  const systemCats: {
    id: string;
    type: string;
    name: string;
    icon: string;
    color: string;
    detail: string;
  }[] = [
    {
      id: BANK_FEE_CATEGORY_ID,
      type: "expense",
      name: "کارمزد و هزینه‌های بانکی",
      icon: "percent",
      color: "#64748b",
      detail: "سرفصل سیستمی – کارمزدها به صورت خودکار در این سرفصل تجمیع می‌شوند.",
    },
    {
      id: PENDING_EXPENSE_CATEGORY_ID,
      type: "expense",
      name: "در انتظار دسته‌بندی (هزینه)",
      icon: "clock",
      color: "#d97706",
      detail: "سرفصل سیستمی – هزینه‌های ثبت‌شده از پیامک که سرفصل آن‌ها هنوز انتخاب نشده است.",
    },
    {
      id: PENDING_INCOME_CATEGORY_ID,
      type: "income",
      name: "در انتظار دسته‌بندی (درآمد)",
      icon: "clock",
      color: "#d97706",
      detail: "سرفصل سیستمی – درآمدهای ثبت‌شده از پیامک که منبع آن‌ها هنوز مشخص نشده است.",
    },
  ];

  for (const c of systemCats) {
    const found = await query<{ c: number }>(`SELECT COUNT(*) AS c FROM accounts WHERE id = ?`, [c.id]);
    if (readNumber(found[0]?.c) === 0) {
      await insertIfAbsent(
        `INSERT INTO accounts (id, type, name, initial_balance, is_favorite, is_parent, detail_info, icon, color)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        [c.id, c.type, c.name, boolParam(false), boolParam(true), c.detail, c.icon, c.color]
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  حساب‌ها                                                             */
/* ------------------------------------------------------------------ */

function mapAccount(r: Record<string, unknown>): AccountRow {
  return {
    id: String(r.id),
    type: String(r.type),
    name: String(r.name),
    initialBalance: readNumber(r.initial_balance),
    isFavorite: readBool(r.is_favorite),
    isParent: readBool(r.is_parent),
    parentId: r.parent_id ? String(r.parent_id) : null,
    detailInfo: r.detail_info ? String(r.detail_info) : null,
    icon: r.icon ? String(r.icon) : null,
    color: r.color ? String(r.color) : null,
    sortOrder: readNumber(r.sort_order),
  };
}

/** کش کوتاه‌مدت لیست حساب‌ها — با هر تغییر باطل می‌شود */
let accountsCache: { at: number; data: AccountRow[] } | null = null;
const ACCOUNTS_CACHE_TTL = 15_000;

export function invalidateAccountsCache() {
  accountsCache = null;
}

export async function listAccounts(): Promise<AccountRow[]> {
  if (accountsCache && Date.now() - accountsCache.at < ACCOUNTS_CACHE_TTL) {
    return accountsCache.data;
  }
  const rows = await query(`SELECT * FROM accounts ORDER BY type, name`);
  const data = sortAccountsHierarchically(rows.map(mapAccount));
  accountsCache = { at: Date.now(), data };
  return data;
}

/**
 * مرتب‌سازی سلسله‌مراتبی: سرفصل‌ها به ترتیب الفبا و زیرمجموعه‌های هر سرفصل
 * بلافاصله پس از خودِ سرفصل قرار می‌گیرند (نه پراکنده در لیست).
 */
export function sortAccountsHierarchically(list: AccountRow[]): AccountRow[] {
  const collator = new Intl.Collator("fa");
  const byName = (a: AccountRow, b: AccountRow) => collator.compare(a.name, b.name);

  const typeOrder: Record<string, number> = { bank: 0, cash: 1, person: 2, expense: 3, income: 4 };
  const parents = list.filter((a) => !a.parentId).sort((a, b) => {
    // ترتیب دستی کاربر (sort_order > 0) بر همه‌چیز مقدم است؛
    // حساب‌های بدون ترتیب دستی بعد از آن‌ها، به ترتیب نوع و الفبا
    const ao = a.sortOrder > 0 ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const bo = b.sortOrder > 0 ? b.sortOrder : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    const t = (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9);
    if (t !== 0) return t;
    return byName(a, b);
  });

  const childrenOf = new Map<string, AccountRow[]>();
  for (const a of list) {
    if (a.parentId) {
      const arr = childrenOf.get(a.parentId) || [];
      arr.push(a);
      childrenOf.set(a.parentId, arr);
    }
  }

  const result: AccountRow[] = [];
  const placed = new Set<string>();
  for (const p of parents) {
    result.push(p);
    placed.add(p.id);
    for (const c of (childrenOf.get(p.id) || []).sort(byName)) {
      result.push(c);
      placed.add(c.id);
    }
  }
  // زیرمجموعه‌هایی که والدشان حذف شده (یتیم) در انتها
  for (const a of list) if (!placed.has(a.id)) result.push(a);
  return result;
}

/**
 * بررسی تکراری بودن نام حساب در همان سطح:
 * - برای بانک/صندوق/شخص: نام در بین حساب‌های همان نوع یکتا باشد
 * - برای سرفصل‌های اصلی: نام در بین سرفصل‌های همان نوع یکتا باشد
 * - برای زیرمجموعه‌ها: نام فقط در بین زیرمجموعه‌های همان سرفصل یکتا باشد
 *   (یک نام در دو سرفصل مختلف مجاز است)
 */
export async function findDuplicateAccount(params: {
  type: string;
  name: string;
  parentId: string | null;
  excludeId?: string | null;
}): Promise<AccountRow | null> {
  const normalized = params.name.trim().replace(/\s+/g, " ").toLowerCase();
  const rows = await query(`SELECT * FROM accounts WHERE type = ?`, [params.type]);
  for (const r of rows.map(mapAccount)) {
    if (params.excludeId && r.id === params.excludeId) continue;
    const sameLevel = (r.parentId || null) === (params.parentId || null);
    if (!sameLevel) continue;
    if (r.name.trim().replace(/\s+/g, " ").toLowerCase() === normalized) return r;
  }
  return null;
}

export async function getAccount(id: string): Promise<AccountRow | null> {
  const rows = await query(`SELECT * FROM accounts WHERE id = ?`, [id]);
  return rows.length ? mapAccount(rows[0]) : null;
}

/**
 * محاسبه گردش حساب‌ها به صورت تجمیعی در سطح دیتابیس.
 * این روش بسیار سریع‌تر از خواندن همه تراکنش‌ها در حافظه است.
 */
export async function getAccountFlows(): Promise<{
  inflow: Map<string, number>;
  outflow: Map<string, number>;
  totalFees: number;
}> {
  // یک پرس‌وجوی واحد به جای سه رفت‌وبرگشت جداگانه
  const rows = await query<{ id: string; kind: string; total: number }>(
    `SELECT to_account_id AS id, 'in' AS kind, SUM(amount) AS total FROM transactions GROUP BY to_account_id
     UNION ALL
     SELECT from_account_id AS id, 'out' AS kind, SUM(amount + fee) AS total FROM transactions GROUP BY from_account_id
     UNION ALL
     SELECT '__fees__' AS id, 'fee' AS kind, SUM(fee) AS total FROM transactions`
  );

  const inflow = new Map<string, number>();
  const outflow = new Map<string, number>();
  let totalFees = 0;
  for (const r of rows) {
    const v = readNumber(r.total);
    if (r.kind === "in") inflow.set(String(r.id), v);
    else if (r.kind === "out") outflow.set(String(r.id), v);
    else totalFees = v;
  }

  return { inflow, outflow, totalFees };
}

export async function createAccount(data: {
  type: string;
  name: string;
  initialBalance: number;
  isFavorite: boolean;
  isParent: boolean;
  parentId: string | null;
  detailInfo: string | null;
  icon: string;
  color: string;
}): Promise<AccountRow> {
  const id = `acc_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  await execute(
    `INSERT INTO accounts (id, type, name, initial_balance, is_favorite, is_parent, parent_id, detail_info, icon, color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.type,
      data.name,
      data.initialBalance,
      boolParam(data.isFavorite),
      boolParam(data.isParent),
      data.parentId,
      data.detailInfo,
      data.icon,
      data.color,
    ]
  );
  invalidateAccountsCache();
  const created = await getAccount(id);
  if (!created) throw new Error("خطا در ایجاد حساب");
  return created;
}

export async function updateAccount(
  id: string,
  fields: Partial<{
    name: string;
    initialBalance: number;
    isFavorite: boolean;
    isParent: boolean;
    parentId: string | null;
    detailInfo: string | null;
    icon: string;
    color: string;
  }>
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (fields.name !== undefined) {
    sets.push("name = ?");
    params.push(fields.name);
  }
  if (fields.initialBalance !== undefined) {
    sets.push("initial_balance = ?");
    params.push(fields.initialBalance);
  }
  if (fields.isFavorite !== undefined) {
    sets.push("is_favorite = ?");
    params.push(boolParam(fields.isFavorite));
  }
  if (fields.isParent !== undefined) {
    sets.push("is_parent = ?");
    params.push(boolParam(fields.isParent));
  }
  if (fields.parentId !== undefined) {
    sets.push("parent_id = ?");
    params.push(fields.parentId);
  }
  if (fields.detailInfo !== undefined) {
    sets.push("detail_info = ?");
    params.push(fields.detailInfo);
  }
  if (fields.icon !== undefined) {
    sets.push("icon = ?");
    params.push(fields.icon);
  }
  if (fields.color !== undefined) {
    sets.push("color = ?");
    params.push(fields.color);
  }

  if (sets.length === 0) return;
  params.push(id);
  await execute(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`, params);
  invalidateAccountsCache();
}

/** ذخیره ترتیب دلخواه کاربر برای مجموعه‌ای از حساب‌ها */
export async function reorderAccounts(orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await execute(`UPDATE accounts SET sort_order = ? WHERE id = ?`, [i + 1, orderedIds[i]]);
  }
  invalidateAccountsCache();
}

export async function countAccountTransactions(id: string): Promise<number> {
  const rows = await query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM transactions WHERE from_account_id = ? OR to_account_id = ?`,
    [id, id]
  );
  return readNumber(rows[0]?.c);
}

export async function countChildAccounts(id: string): Promise<number> {
  const rows = await query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM accounts WHERE parent_id = ?`,
    [id]
  );
  return readNumber(rows[0]?.c);
}

export async function deleteAccount(id: string): Promise<void> {
  await execute(`DELETE FROM accounts WHERE id = ?`, [id]);
  invalidateAccountsCache();
}

/* ------------------------------------------------------------------ */
/*  تراکنش‌ها                                                           */
/* ------------------------------------------------------------------ */

function mapTransaction(r: Record<string, unknown>): TransactionRow {
  const rawDate = r.date;
  return {
    id: String(r.id),
    type: String(r.type),
    amount: readNumber(r.amount),
    fee: readNumber(r.fee),
    fromAccountId: String(r.from_account_id),
    toAccountId: String(r.to_account_id),
    date: rawDate instanceof Date ? rawDate.toISOString() : String(rawDate),
    shamsiDate: String(r.shamsi_date),
    description: r.description ? String(r.description) : null,
    trackingNumber: r.tracking_number ? String(r.tracking_number) : null,
    status: r.status ? String(r.status) : "active",
    sourceHash: r.source_hash ? String(r.source_hash) : null,
  };
}

export interface TxFilter {
  id?: string | null;
  type?: string | null;
  accountIds?: string[];
  startDate?: string | null;
  endDate?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

function buildTxWhere(filter: TxFilter): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.id) {
    conditions.push("t.id = ?");
    params.push(filter.id);
  }

  if (filter.type) {
    conditions.push("t.type = ?");
    params.push(filter.type);
  }

  if (filter.accountIds && filter.accountIds.length > 0) {
    const marks = filter.accountIds.map(() => "?").join(", ");
    conditions.push(`(t.from_account_id IN (${marks}) OR t.to_account_id IN (${marks}))`);
    params.push(...filter.accountIds, ...filter.accountIds);
  }

  if (filter.startDate) {
    conditions.push("t.shamsi_date >= ?");
    params.push(filter.startDate);
  }
  if (filter.endDate) {
    conditions.push("t.shamsi_date <= ?");
    params.push(filter.endDate);
  }

  if (filter.search && filter.search.trim()) {
    const term = `%${filter.search.trim().toLowerCase()}%`;
    conditions.push(
      `(LOWER(COALESCE(t.description, '')) LIKE ?
        OR LOWER(COALESCE(t.tracking_number, '')) LIKE ?
        OR ${castToText("t.amount")} LIKE ?
        OR t.shamsi_date LIKE ?
        OR LOWER(COALESCE(fa.name, '')) LIKE ?
        OR LOWER(COALESCE(ta.name, '')) LIKE ?)`
    );
    params.push(term, term, term, term, term, term);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

const TX_JOIN = `FROM transactions t
  LEFT JOIN accounts fa ON fa.id = t.from_account_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id`;

/** دریافت تراکنش‌ها با صفحه‌بندی سمت سرور */
export async function listTransactions(
  filter: TxFilter
): Promise<{ items: TransactionRow[]; total: number; sums: { expense: number; income: number; fee: number } }> {
  const { clause, params } = buildTxWhere(filter);
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 500);
  const offset = Math.max(filter.offset ?? 0, 0);

  const [rows, countRows, sumRows] = await Promise.all([
    query(
      `SELECT t.* ${TX_JOIN} ${clause} ORDER BY t.date DESC, t.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ),
    query<{ c: number }>(`SELECT COUNT(*) AS c ${TX_JOIN} ${clause}`, params),
    query<{ expense: number; income: number; fee: number }>(
      `SELECT
         SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) AS expense,
         SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) AS income,
         SUM(t.fee) AS fee
       ${TX_JOIN} ${clause}`,
      params
    ),
  ]);

  return {
    items: rows.map(mapTransaction),
    total: readNumber(countRows[0]?.c),
    sums: {
      expense: readNumber(sumRows[0]?.expense),
      income: readNumber(sumRows[0]?.income),
      fee: readNumber(sumRows[0]?.fee),
    },
  };
}

export async function getTransaction(id: string): Promise<TransactionRow | null> {
  const rows = await query(`SELECT * FROM transactions WHERE id = ?`, [id]);
  return rows.length ? mapTransaction(rows[0]) : null;
}

export async function createTransaction(data: {
  type: string;
  amount: number;
  fee: number;
  fromAccountId: string;
  toAccountId: string;
  date: Date;
  shamsiDate: string;
  description: string | null;
  trackingNumber: string | null;
  /** وضعیت تراکنش — پیش‌فرض active؛ تراکنش‌های پیامکی pending هستند */
  status?: string;
  /** هش متن پیامک مبدأ (اختیاری، برای تشخیص تکراری) */
  sourceHash?: string | null;
}): Promise<TransactionRow> {
  const id = `tx_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  await execute(
    `INSERT INTO transactions (id, type, amount, fee, from_account_id, to_account_id, date, shamsi_date, description, tracking_number, status, source_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.type,
      data.amount,
      data.fee,
      data.fromAccountId,
      data.toAccountId,
      data.date,
      data.shamsiDate,
      data.description,
      data.trackingNumber,
      data.status || "active",
      data.sourceHash ?? null,
    ]
  );
  const created = await getTransaction(id);
  if (!created) throw new Error("خطا در ثبت تراکنش");
  return created;
}

export async function updateTransaction(
  id: string,
  fields: {
    type: string;
    amount?: number;
    fee: number;
    fromAccountId: string;
    toAccountId: string;
    date?: Date;
    shamsiDate?: string;
    description?: string | null;
    trackingNumber?: string | null;
  }
): Promise<void> {
  const sets = ["type = ?", "fee = ?", "from_account_id = ?", "to_account_id = ?"];
  const params: unknown[] = [fields.type, fields.fee, fields.fromAccountId, fields.toAccountId];

  if (fields.amount !== undefined) {
    sets.push("amount = ?");
    params.push(fields.amount);
  }
  if (fields.date !== undefined && fields.shamsiDate !== undefined) {
    sets.push("date = ?", "shamsi_date = ?");
    params.push(fields.date, fields.shamsiDate);
  }
  if (fields.description !== undefined) {
    sets.push("description = ?");
    params.push(fields.description);
  }
  if (fields.trackingNumber !== undefined) {
    sets.push("tracking_number = ?");
    params.push(fields.trackingNumber);
  }

  params.push(id);
  await execute(`UPDATE transactions SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function deleteTransaction(id: string): Promise<void> {
  await execute(`DELETE FROM transactions WHERE id = ?`, [id]);
}

/**
 * جستجوی تراکنش تکراری بر اساس هش متن پیامک (پنجره ۷ روزه).
 * از ثبت دوباره یک پیامک فورواردشده جلوگیری می‌کند.
 */
export async function findRecentDuplicateByHash(hash: string): Promise<TransactionRow | null> {
  const rows = await query(
    `SELECT * FROM transactions WHERE source_hash = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1`,
    [hash, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]
  );
  return rows.length ? mapTransaction(rows[0]) : null;
}

/** تغییر وضعیت تراکنش (مثلاً از pending به active پس از تکمیل طرف دوم) */
export async function setTransactionStatus(id: string, status: string): Promise<void> {
  await execute(`UPDATE transactions SET status = ? WHERE id = ?`, [status, id]);
}

/* ------------------------------------------------------------------ */
/*  گزارشات (تجمیع در سطح دیتابیس)                                      */
/* ------------------------------------------------------------------ */

export async function getReportAggregates(
  startDate: string | null,
  endDate: string | null
): Promise<{
  categoryTotals: Map<string, number>;
  periodExpense: number;
  periodIncome: number;
  totalFee: number;
  txCount: number;
}> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (startDate) {
    conditions.push("shamsi_date >= ?");
    params.push(startDate);
  }
  if (endDate) {
    conditions.push("shamsi_date <= ?");
    params.push(endDate);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [expRows, incRows, totals] = await Promise.all([
    query<{ id: string; total: number }>(
      `SELECT to_account_id AS id, SUM(amount) AS total FROM transactions
       ${where}${where ? " AND" : " WHERE"} type = 'expense' GROUP BY to_account_id`,
      params
    ),
    query<{ id: string; total: number }>(
      `SELECT from_account_id AS id, SUM(amount) AS total FROM transactions
       ${where}${where ? " AND" : " WHERE"} type = 'income' GROUP BY from_account_id`,
      params
    ),
    query<{ expense: number; income: number; fee: number; c: number }>(
      `SELECT
         SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense,
         SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
         SUM(fee) AS fee,
         COUNT(*) AS c
       FROM transactions ${where}`,
      params
    ),
  ]);

  const categoryTotals = new Map<string, number>();
  for (const r of [...expRows, ...incRows]) {
    categoryTotals.set(String(r.id), readNumber(r.total));
  }

  const totalFee = readNumber(totals[0]?.fee);
  if (totalFee > 0) {
    categoryTotals.set(
      BANK_FEE_CATEGORY_ID,
      (categoryTotals.get(BANK_FEE_CATEGORY_ID) || 0) + totalFee
    );
  }

  return {
    categoryTotals,
    periodExpense: readNumber(totals[0]?.expense) + totalFee,
    periodIncome: readNumber(totals[0]?.income),
    totalFee,
    txCount: readNumber(totals[0]?.c),
  };
}

/* ------------------------------------------------------------------ */
/*  کاربران                                                             */
/* ------------------------------------------------------------------ */

export interface UserRow {
  id: string;
  username: string;
  passwordHash: string;
  fullName: string | null;
}

export async function findUser(username: string): Promise<UserRow | null> {
  const rows = await query(`SELECT * FROM users WHERE username = ?`, [username]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    username: String(r.username),
    passwordHash: String(r.password_hash),
    fullName: r.full_name ? String(r.full_name) : null,
  };
}

export async function getFirstUser(): Promise<UserRow | null> {
  const rows = await query(`SELECT * FROM users LIMIT 1`);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    username: String(r.username),
    passwordHash: String(r.password_hash),
    fullName: r.full_name ? String(r.full_name) : null,
  };
}

export async function updateUserPassword(id: string, passwordHash: string): Promise<void> {
  await execute(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, id]);
}

/* ------------------------------------------------------------------ */
/*  گردش حساب با مانده لحظه‌ای (Running Balance)                        */
/* ------------------------------------------------------------------ */

export interface LedgerRow {
  id: string;
  type: string;
  amount: number;
  fee: number;
  date: string;
  shamsiDate: string;
  description: string | null;
  trackingNumber: string | null;
  /** جهت تراکنش نسبت به حساب انتخاب‌شده */
  direction: "in" | "out";
  /** طرف مقابل تراکنش */
  counterpartyId: string;
  counterpartyName: string;
  counterpartyParentName: string | null;
  /** مانده حساب پس از این تراکنش (با احتساب کارمزد) */
  balanceAfter: number;
}

/**
 * گردش یک حساب (یا سرفصل به همراه زیرمجموعه‌ها) با مانده لحظه‌ای.
 * مانده به ترتیب زمانی از مانده اولیه محاسبه می‌شود و لیست از جدید به قدیم برگردانده می‌شود.
 */
export async function getLedger(params: {
  accountIds: string[];
  isAsset: boolean;
  initialBalance: number;
  startDate?: string | null;
  endDate?: string | null;
  search?: string | null;
  limit: number;
  offset: number;
}): Promise<{ rows: LedgerRow[]; total: number; openingBalance: number; closingBalance: number }> {
  const { accountIds, isAsset, initialBalance, startDate, endDate, search } = params;
  const limit = Math.min(Math.max(params.limit, 1), 500);
  const offset = Math.max(params.offset, 0);

  const marks = accountIds.map(() => "?").join(", ");
  const accParams = [...accountIds, ...accountIds];

  // تمام تراکنش‌های مرتبط با حساب به ترتیب زمانی (برای محاسبه مانده تجمعی)
  const allRows = await query(
    `SELECT t.*, fa.name AS from_name, fa.parent_id AS from_parent, ta.name AS to_name, ta.parent_id AS to_parent
     FROM transactions t
     LEFT JOIN accounts fa ON fa.id = t.from_account_id
     LEFT JOIN accounts ta ON ta.id = t.to_account_id
     WHERE (t.from_account_id IN (${marks}) OR t.to_account_id IN (${marks}))
     ORDER BY t.date ASC, t.created_at ASC, t.id ASC`,
    accParams
  );

  // نام سرفصل‌های والد برای نمایش
  const parentIds = new Set<string>();
  for (const r of allRows) {
    if (r.from_parent) parentIds.add(String(r.from_parent));
    if (r.to_parent) parentIds.add(String(r.to_parent));
  }
  const parentNames = new Map<string, string>();
  if (parentIds.size > 0) {
    const ids = Array.from(parentIds);
    const prows = await query<{ id: string; name: string }>(
      `SELECT id, name FROM accounts WHERE id IN (${ids.map(() => "?").join(", ")})`,
      ids
    );
    for (const p of prows) parentNames.set(String(p.id), String(p.name));
  }

  const idSet = new Set(accountIds);
  let running = isAsset ? initialBalance : 0;
  const term = search?.trim().toLowerCase() || "";

  const computed: LedgerRow[] = [];
  for (const r of allRows) {
    const tx = mapTransaction(r);
    const isOut = idSet.has(tx.fromAccountId);
    const fee = isOut ? tx.fee : 0;

    if (isAsset) {
      running += isOut ? -(tx.amount + fee) : tx.amount;
    } else {
      // برای سرفصل‌ها مانده = گردش تجمعی
      running += tx.amount;
    }

    const counterpartyId = isOut ? tx.toAccountId : tx.fromAccountId;
    const counterpartyName = String(isOut ? r.to_name || "" : r.from_name || "");
    const cpParent = isOut ? r.to_parent : r.from_parent;

    computed.push({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      fee,
      date: tx.date,
      shamsiDate: tx.shamsiDate,
      description: tx.description,
      trackingNumber: tx.trackingNumber,
      direction: isOut ? "out" : "in",
      counterpartyId,
      counterpartyName,
      counterpartyParentName: cpParent ? parentNames.get(String(cpParent)) || null : null,
      balanceAfter: running,
    });
  }

  const closingBalance = running;

  // اعمال فیلترهای تاریخ و جستجو پس از محاسبه مانده (تا مانده صحیح بماند)
  let filtered = computed;
  let openingBalance = isAsset ? initialBalance : 0;

  if (startDate) {
    const before = computed.filter((x) => x.shamsiDate < startDate);
    if (before.length > 0) openingBalance = before[before.length - 1].balanceAfter;
    filtered = filtered.filter((x) => x.shamsiDate >= startDate);
  }
  if (endDate) filtered = filtered.filter((x) => x.shamsiDate <= endDate);

  if (term) {
    filtered = filtered.filter(
      (x) =>
        (x.description || "").toLowerCase().includes(term) ||
        (x.trackingNumber || "").toLowerCase().includes(term) ||
        x.counterpartyName.toLowerCase().includes(term) ||
        String(x.amount).includes(term) ||
        x.shamsiDate.includes(term)
    );
  }

  // جدیدترین در بالا: ابتدا بر اساس تاریخ تراکنش، سپس زمان ثبت (برای تراکنش‌های هم‌روز)
  filtered.sort((a, b) => {
    if (a.shamsiDate !== b.shamsiDate) return a.shamsiDate < b.shamsiDate ? 1 : -1;
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    if (ta !== tb) return tb - ta;
    return a.id < b.id ? 1 : -1;
  });

  return {
    rows: filtered.slice(offset, offset + limit),
    total: filtered.length,
    openingBalance,
    closingBalance,
  };
}

/* ------------------------------------------------------------------ */
/*  اسنپ‌شات‌های پشتیبان خودکار                                          */
/* ------------------------------------------------------------------ */

export interface SnapshotMeta {
  id: string;
  createdAt: string;
  shamsiDate: string;
  source: string;
  accountCount: number;
  transactionCount: number;
  sizeKb: number;
}

const MAX_SNAPSHOTS = 30;

/** ساخت یک اسنپ‌شات کامل و نگهداری حداکثر ۳۰ نسخه آخر */
export async function createSnapshot(source: "auto" | "manual" = "auto"): Promise<SnapshotMeta> {
  const data = await exportAll();
  const payload = JSON.stringify({
    version: "2.1",
    exportDate: new Date().toISOString(),
    accounts: data.accounts,
    transactions: data.transactions,
  });

  const id = `snap_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const shamsi = toShamsiDateString(new Date());

  await execute(
    `INSERT INTO backup_snapshots (id, shamsi_date, source, account_count, transaction_count, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, shamsi, source, data.accounts.length, data.transactions.length, payload]
  );

  // حذف نسخه‌های قدیمی‌تر از سقف مجاز
  const all = await query<{ id: string }>(
    `SELECT id FROM backup_snapshots ORDER BY created_at DESC`
  );
  const stale = all.slice(MAX_SNAPSHOTS).map((r) => String(r.id));
  if (stale.length > 0) {
    await execute(
      `DELETE FROM backup_snapshots WHERE id IN (${stale.map(() => "?").join(", ")})`,
      stale
    );
  }

  return {
    id,
    createdAt: new Date().toISOString(),
    shamsiDate: shamsi,
    source,
    accountCount: data.accounts.length,
    transactionCount: data.transactions.length,
    sizeKb: Math.round(Buffer.byteLength(payload, "utf8") / 1024),
  };
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const rows = await query(
    `SELECT id, created_at, shamsi_date, source, account_count, transaction_count,
            ${dialect === "mysql" ? "LENGTH(payload)" : "OCTET_LENGTH(payload)"} AS size_bytes
     FROM backup_snapshots ORDER BY created_at DESC`
  );
  return rows.map((r) => ({
    id: String(r.id),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    shamsiDate: String(r.shamsi_date),
    source: String(r.source),
    accountCount: readNumber(r.account_count),
    transactionCount: readNumber(r.transaction_count),
    sizeKb: Math.round(readNumber(r.size_bytes) / 1024),
  }));
}

export async function getSnapshotPayload(id: string): Promise<string | null> {
  const rows = await query<{ payload: string }>(
    `SELECT payload FROM backup_snapshots WHERE id = ?`,
    [id]
  );
  return rows.length ? String(rows[0].payload) : null;
}

/** آخرین زمان اسنپ‌شات خودکار (برای هشدار در تنظیمات) */
export async function getLastSnapshotDate(): Promise<string | null> {
  const rows = await query<{ shamsi_date: string }>(
    `SELECT shamsi_date FROM backup_snapshots ORDER BY created_at DESC LIMIT 1`
  );
  return rows.length ? String(rows[0].shamsi_date) : null;
}

/* ------------------------------------------------------------------ */
/*  پشتیبان‌گیری                                                        */
/* ------------------------------------------------------------------ */

export async function exportAll() {
  const [users, accounts, transactions] = await Promise.all([
    query(`SELECT * FROM users`),
    query(`SELECT * FROM accounts`),
    query(`SELECT * FROM transactions`),
  ]);
  return {
    users,
    accounts: accounts.map(mapAccount),
    transactions: transactions.map(mapTransaction),
  };
}

export async function replaceAll(
  accountsData: AccountRow[],
  txData: TransactionRow[]
): Promise<void> {
  invalidateAccountsCache();
  await execute(`DELETE FROM transactions`);
  await execute(`DELETE FROM accounts`);

  for (const a of accountsData) {
    await execute(
      `INSERT INTO accounts (id, type, name, initial_balance, is_favorite, is_parent, parent_id, detail_info, icon, color, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.id,
        a.type,
        a.name,
        a.initialBalance,
        boolParam(a.isFavorite),
        boolParam(a.isParent),
        a.parentId,
        a.detailInfo,
        a.icon || "wallet",
        a.color || "#0284c7",
        a.sortOrder || 0,
      ]
    );
  }

  for (const t of txData) {
    await execute(
      `INSERT INTO transactions (id, type, amount, fee, from_account_id, to_account_id, date, shamsi_date, description, tracking_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.id,
        t.type,
        t.amount,
        t.fee || 0,
        t.fromAccountId,
        t.toAccountId,
        new Date(t.date),
        t.shamsiDate,
        t.description,
        t.trackingNumber,
      ]
    );
  }
}
