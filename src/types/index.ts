export type AccountType = "bank" | "cash" | "person" | "income" | "expense";

export interface Account {
  id: string;
  type: AccountType;
  name: string;
  initialBalance: number;
  isFavorite: boolean;
  isParent: boolean;
  parentId?: string | null;
  detailInfo?: string | null;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
  balance?: number;
  totalFlow?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type TransactionType = "expense" | "income" | "transfer";

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  fee?: number;
  fromAccountId: string;
  toAccountId: string;
  date: string;
  shamsiDate: string;
  description?: string | null;
  trackingNumber?: string | null;
  /** وضعیت: active (کامل) یا pending (ثبت‌شده از پیامک، در انتظار تکمیل) */
  status?: "pending" | "active";
  createdAt?: string;
  updatedAt?: string;
  fromAccount?: {
    id: string;
    name: string;
    type: AccountType;
    parentName?: string;
    icon?: string | null;
    color?: string | null;
  } | null;
  toAccount?: {
    id: string;
    name: string;
    type: AccountType;
    parentName?: string;
    icon?: string | null;
    color?: string | null;
  } | null;
}

export interface ReportCategory {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  total: number;
  percentage: string;
  subcategories: {
    id: string;
    name: string;
    total: number;
    color?: string | null;
    icon?: string | null;
  }[];
}

export interface ReportSummary {
  totalBank: number;
  totalCash: number;
  totalLiquid: number;
  totalPersonsNet: number;
  periodIncome: number;
  periodExpense: number;
  netPeriodSavings: number;
  txCount: number;
}
