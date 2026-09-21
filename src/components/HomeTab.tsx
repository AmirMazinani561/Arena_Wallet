"use client";

import React from "react";
import { Account, Transaction } from "@/types";
import { formatMoney, getCurrentShamsi } from "@/lib/date-utils";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowRightLeft,
  Calendar,
  Hourglass,
  CreditCard,
  Wallet,
  Users,
  TrendingDown,
  TrendingUp,
  ChevronLeft,
} from "lucide-react";
import { FavoritesList } from "./FavoritesList";

interface Props {
  accounts: Account[];
  transactions: Transaction[];
  pendingTxs: Transaction[];
  onSelectPendingTx: (tx: Transaction) => void;
  recentLimit: number;
  onChangeRecentLimit: (n: number) => void;
  onOpenNewTx: () => void;
  onAccountAction: (acc: Account) => void;
  onSaveOrder: (ids: string[]) => Promise<void>;
  onSelectTx: (tx: Transaction) => void;
  onSwitchTab: (tab: string) => void;
}

/** نمایش نام حساب به همراه سرگروه */
function accLabel(a?: { name: string; parentName?: string } | null): string {
  if (!a) return "";
  return a.parentName ? `${a.parentName} ← ${a.name}` : a.name;
}

/** آیکون و رنگ بر اساس نوع حساب */
function AccCardIcon({ type }: { type: string }) {
  const cls = "w-5 h-5";
  if (type === "bank")
    return <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center"><CreditCard className={cls} /></div>;
  if (type === "cash")
    return <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><Wallet className={cls} /></div>;
  if (type === "person")
    return <div className="w-10 h-10 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center"><Users className={cls} /></div>;
  if (type === "expense")
    return <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center"><TrendingDown className={cls} /></div>;
  return <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-600 flex items-center justify-center"><TrendingUp className={cls} /></div>;
}

export function HomeTab({
  accounts,
  transactions,
  pendingTxs,
  onSelectPendingTx,
  recentLimit,
  onChangeRecentLimit,
  onAccountAction,
  onSaveOrder,
  onSelectTx,
  onSwitchTab,
}: Props) {
  const currentShamsi = getCurrentShamsi();

  const favoriteAccounts = accounts.filter((a) => a.isFavorite);
  const bySort = (a: Account, b: Account) => {
    const ao = a.sortOrder && a.sortOrder > 0 ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const bo = b.sortOrder && b.sortOrder > 0 ? b.sortOrder : Number.MAX_SAFE_INTEGER;
    return ao - bo;
  };
  const favoriteAssets = favoriteAccounts
    .filter((a) => a.type === "bank" || a.type === "cash" || a.type === "person")
    .sort(bySort);
  const favoriteCategories = favoriteAccounts
    .filter((a) => a.type === "expense" || a.type === "income")
    .sort(bySort);

  const totalLiquid = accounts
    .filter((a) => a.type === "bank" || a.type === "cash")
    .reduce((sum, a) => sum + (a.balance || 0), 0);

  const totalPersonsNet = accounts
    .filter((a) => a.type === "person")
    .reduce((sum, a) => sum + (a.balance || 0), 0);

  // محاسبه درآمد و هزینه ماه جاری
  const currentMonth = currentShamsi.fullText.slice(0, 7); // '1404/06'
  const monthlyIncome = transactions
    .filter((t) => t.type === "income" && t.shamsiDate?.startsWith(currentMonth))
    .reduce((s, t) => s + t.amount, 0);
  const monthlyExpense = transactions
    .filter((t) => t.type === "expense" && t.shamsiDate?.startsWith(currentMonth))
    .reduce((s, t) => s + t.amount, 0);

  const recentTxs = transactions.slice(0, recentLimit);

  return (
    <div className="space-y-5 pb-6 animate-in fade-in duration-150">

      {/* ── کارت موجودی کل ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-500 text-white p-5 shadow-2xl shadow-sky-500/20">
        {/* دایره‌های تزئینی پس‌زمینه */}
        <div className="absolute top-0 right-0 -mr-10 -mt-10 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-10 -mb-10 w-48 h-48 bg-sky-900/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/4 w-32 h-32 bg-cyan-300/10 rounded-full blur-2xl pointer-events-none" />

        {/* تاریخ شمسی */}
        <div className="relative z-10 flex items-center gap-1.5 text-sky-100/90 text-[11px] mb-3">
          <Calendar className="w-3.5 h-3.5" />
          <span>{currentShamsi.fullText}</span>
        </div>

        {/* موجودی اصلی */}
        <div className="relative z-10 mb-4">
          <div className="text-[11px] text-sky-200 font-medium mb-1">موجودی در دسترس</div>
          <div className="text-4xl font-black dir-ltr tracking-tight leading-none">
            {formatMoney(totalLiquid)}
            <span className="text-base font-semibold mr-2 opacity-80">ریال</span>
          </div>
          {totalPersonsNet !== 0 && (
            <div className="text-[11px] text-sky-100/80 mt-2 flex items-center gap-1">
              <span>اشخاص:</span>
              <span className={`font-bold dir-ltr ${totalPersonsNet > 0 ? "text-emerald-200" : "text-amber-200"}`}>
                {formatMoney(Math.abs(totalPersonsNet))} ریال {totalPersonsNet > 0 ? "(طلب)" : "(بدهی)"}
              </span>
            </div>
          )}
        </div>

        {/* متریک‌های ماه جاری */}
        <div className="relative z-10 flex items-center gap-3 pt-3 border-t border-white/15">
          <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-2xl px-3 py-2">
            <div className="text-[10px] text-emerald-200 font-medium mb-0.5 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" />
              درآمد ماه
            </div>
            <div className="text-sm font-bold text-white dir-ltr">
              {formatMoney(monthlyIncome)}
            </div>
          </div>
          <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-2xl px-3 py-2">
            <div className="text-[10px] text-rose-200 font-medium mb-0.5 flex items-center gap-1">
              <ArrowDownRight className="w-3 h-3" />
              هزینه ماه
            </div>
            <div className="text-sm font-bold text-white dir-ltr">
              {formatMoney(monthlyExpense)}
            </div>
          </div>
        </div>
      </div>

      {/* ── حساب‌های منتخب — اسکرول افقی ── */}
      {favoriteAssets.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              حساب‌های منتخب
            </h3>
            <button
              type="button"
              onClick={() => onSwitchTab("accounts")}
              className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-0.5"
            >
              مدیریت
              <ChevronLeft className="w-3 h-3" />
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {favoriteAssets.map((acc) => {
              const bal = acc.type === "expense" || acc.type === "income"
                ? (acc.totalFlow || 0)
                : (acc.balance ?? acc.initialBalance);
              const isNeg = acc.type === "person" && bal < 0;
              const isPos = acc.type === "person" && bal > 0;
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => onAccountAction(acc)}
                  className="flex flex-col items-center gap-1.5 p-3 bg-white rounded-2xl shadow-sm shadow-sky-100/80 border border-sky-50 min-w-[90px] shrink-0 active:scale-95 transition hover:shadow-md hover:border-sky-100"
                >
                  <AccCardIcon type={acc.type} />
                  <div className="text-[11px] font-bold text-slate-700 text-center leading-tight max-w-[80px] truncate">
                    {acc.name}
                  </div>
                  <div className={`text-[11px] font-extrabold dir-ltr ${
                    isNeg ? "text-rose-600" : isPos ? "text-emerald-600" : "text-slate-800"
                  }`}>
                    {formatMoney(Math.abs(bal))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {favoriteAssets.length === 0 && (
        <div className="p-4 rounded-2xl bg-white border border-sky-100 text-center text-xs text-slate-400">
          هنوز حسابی برای نمایش در صفحه اصلی انتخاب نکرده‌اید.
          <div className="mt-1">
            در ایجاد یا ویرایش حساب، تیک{" "}
            <span className="font-semibold text-sky-600">⭐ نمایش در صفحه اصلی</span> را فعال نمایید.
          </div>
        </div>
      )}

      {/* ── تراکنش‌های در انتظار ثبت ── */}
      {pendingTxs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              در انتظار تکمیل
            </h3>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              {pendingTxs.length} مورد
            </span>
          </div>

          <div className="space-y-2">
            {pendingTxs.map((tx) => {
              const isExp = tx.type === "expense";
              const isInc = tx.type === "income";
              return (
                <div
                  key={tx.id}
                  onClick={() => onSelectPendingTx(tx)}
                  className="flex items-center justify-between gap-3 bg-white rounded-2xl p-3 shadow-sm shadow-amber-100/60 border border-amber-100/80 cursor-pointer hover:shadow-md hover:border-amber-200 transition active:scale-[0.98]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                      isExp ? "bg-rose-50 text-rose-600" : isInc ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                    }`}>
                      {isExp ? <ArrowDownRight className="w-4 h-4" /> : isInc ? <ArrowUpRight className="w-4 h-4" /> : <Hourglass className="w-4 h-4" />}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5">
                        <span className="truncate">{tx.description || (isExp ? "پرداخت هزینه" : isInc ? "دریافت درآمد" : "تراکنش")}</span>
                        <span className="shrink-0 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">در انتظار</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {tx.shamsiDate} • {accLabel(tx.fromAccount)} ⟵ {accLabel(tx.toAccount)}
                      </div>
                    </div>
                  </div>
                  <div className={`text-xs font-extrabold dir-ltr shrink-0 ${
                    isExp ? "text-rose-600" : isInc ? "text-emerald-600" : "text-amber-600"
                  }`}>
                    {formatMoney(tx.amount)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-slate-400 px-1 leading-relaxed">
            این تراکنش‌ها از پیامک ثبت شده‌اند — برای تکمیل، روی هر مورد بزنید.
          </div>
        </div>
      )}

      {/* ── سرفصل‌های منتخب ── */}
      {favoriteCategories.length > 0 && (
        <FavoritesList
          title="سرفصل‌های منتخب"
          dotColor="bg-amber-400"
          badgeCls="text-amber-700 bg-amber-50 border-amber-100"
          items={favoriteCategories}
          onAccountAction={onAccountAction}
          onSaveOrder={onSaveOrder}
        />
      )}

      {/* ── تراکنش‌های اخیر ── */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-slate-700">تراکنش‌های اخیر</h3>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span>نمایش</span>
            <select
              value={recentLimit}
              onChange={(e) => onChangeRecentLimit(parseInt(e.target.value, 10))}
              className="px-2 py-1 text-[11px] font-bold text-sky-700 bg-white border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none cursor-pointer text-center"
            >
              {[5, 10, 15, 20, 30, 50].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span>تراکنش آخر</span>
          </label>
        </div>

        {recentTxs.length === 0 ? (
          <div className="p-5 rounded-2xl bg-white border border-slate-100 text-center text-xs text-slate-400">
            تراکنشی یافت نشد. با دکمه + اولین تراکنش را ثبت نمایید.
          </div>
        ) : (
          <div className="space-y-2">
            {recentTxs.map((tx) => {
              const isExp = tx.type === "expense";
              const isInc = tx.type === "income";
              return (
                <div
                  key={tx.id}
                  onClick={() => onSelectTx(tx)}
                  className="flex items-center justify-between gap-3 bg-white rounded-2xl px-3 py-2.5 shadow-sm shadow-slate-100/80 border border-slate-100/80 cursor-pointer hover:shadow-md hover:border-sky-100 transition active:scale-[0.98]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                      isExp ? "bg-rose-50 text-rose-500" : isInc ? "bg-emerald-50 text-emerald-500" : "bg-sky-50 text-sky-500"
                    }`}>
                      {isExp ? <ArrowDownRight className="w-4 h-4" /> : isInc ? <ArrowUpRight className="w-4 h-4" /> : <ArrowRightLeft className="w-4 h-4" />}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5">
                        <span className="truncate">
                          {tx.description || (isExp ? "پرداخت هزینه" : isInc ? "دریافت درآمد" : "انتقال وجه")}
                        </span>
                        {tx.status === "pending" && (
                          <span className="shrink-0 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            در انتظار
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <span className="bg-slate-100 rounded px-1.5 py-0.5 font-medium">{tx.shamsiDate}</span>
                        <span className="truncate">{accLabel(tx.fromAccount)} ⟵ {accLabel(tx.toAccount)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <div className={`text-sm font-extrabold dir-ltr leading-none ${
                      isExp ? "text-rose-600" : isInc ? "text-emerald-600" : "text-sky-600"
                    }`}>
                      {isExp ? "−" : isInc ? "+" : ""}{formatMoney(tx.amount)}
                    </div>
                    {(tx.fee || 0) > 0 && (
                      <div className="text-[9px] text-amber-500 dir-ltr mt-0.5">
                        کارمزد {formatMoney(tx.fee || 0)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
