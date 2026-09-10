"use client";

import React from "react";
import { Account, Transaction } from "@/types";
import { formatMoney, getCurrentShamsi } from "@/lib/date-utils";
import { ArrowDownRight, ArrowUpRight, ArrowRightLeft, Calendar, Plus } from "lucide-react";
import { FavoritesList } from "./FavoritesList";

interface Props {
  accounts: Account[];
  transactions: Transaction[];
  recentLimit: number;
  onChangeRecentLimit: (n: number) => void;
  onOpenNewTx: () => void;
  onAccountAction: (acc: Account) => void;
  onSaveOrder: (ids: string[]) => Promise<void>;
  onSelectTx: (tx: Transaction) => void;
  onSwitchTab: (tab: string) => void;
}

/** نمایش نام حساب به همراه سرگروه: «سرگروه ← زیرمجموعه» */
function accLabel(a?: { name: string; parentName?: string } | null): string {
  if (!a) return "";
  return a.parentName ? `${a.parentName} ← ${a.name}` : a.name;
}

export function HomeTab({
  accounts,
  transactions,
  recentLimit,
  onChangeRecentLimit,
  onOpenNewTx,
  onAccountAction,
  onSaveOrder,
  onSelectTx,
  onSwitchTab,
}: Props) {
  const currentShamsi = getCurrentShamsi();

  // فقط حساب‌های دارای تیک «منتخب» در صفحه اصلی نمایش داده می‌شوند
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

  const recentTxs = transactions.slice(0, recentLimit);

  return (
    <div className="space-y-4 pb-6 animate-in fade-in duration-150">
      {/* کارت موجودی کل — تمام آیتم‌ها وسط‌چین */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-600 text-white p-5 shadow-xl shadow-sky-600/15 text-center">
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-40 h-40 bg-sky-900/20 rounded-full blur-2xl pointer-events-none" />

        {/* عنوان موجودی و تاریخ روز کنار هم */}
        <div className="relative z-10 flex items-center justify-center gap-2 flex-wrap text-xs text-sky-100 mb-2">
          <span className="font-medium">موجودی در دسترس</span>
          <span className="w-1 h-1 rounded-full bg-sky-200/70" />
          <span className="flex items-center gap-1 bg-white/15 px-2.5 py-1 rounded-full text-[11px] backdrop-blur-sm">
            <Calendar className="w-3 h-3 text-sky-200" />
            <span>{currentShamsi.fullText}</span>
          </span>
        </div>

        <div className="relative z-10 mb-4">
          <div className="text-3xl font-black dir-ltr tracking-tight">
            {formatMoney(totalLiquid)}
            <span className="text-sm font-normal mr-1.5 opacity-90">ریال</span>
          </div>
          {totalPersonsNet !== 0 && (
            <div className="text-[11px] text-sky-100/90 mt-1.5 flex items-center justify-center gap-1">
              <span>وضعیت اشخاص:</span>
              <span
                className={`font-bold dir-ltr ${
                  totalPersonsNet > 0 ? "text-emerald-200" : "text-amber-200"
                }`}
              >
                {formatMoney(Math.abs(totalPersonsNet))} ریال{" "}
                {totalPersonsNet > 0 ? "(طلب ما)" : "(بدهی ما)"}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenNewTx}
          className="relative z-10 w-full py-3 px-4 bg-white/95 hover:bg-white text-sky-700 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold transition active:scale-[0.98] shadow-lg shadow-sky-900/10"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>ثبت تراکنش جدید</span>
        </button>
      </div>

      {/* حساب‌های منتخب — قابل چینش */}
      <FavoritesList
        title="حساب‌های منتخب"
        dotColor="bg-sky-500"
        badgeCls="text-sky-600 bg-sky-50 border-sky-100"
        items={favoriteAssets}
        onAccountAction={onAccountAction}
        onSaveOrder={onSaveOrder}
        headerAction={
          <button
            type="button"
            onClick={() => onSwitchTab("accounts")}
            className="text-[11px] font-semibold text-sky-600 hover:text-sky-700"
          >
            مدیریت حساب‌ها
          </button>
        }
        emptyState={
          <div className="p-4 rounded-2xl bg-white border border-sky-100 text-center text-xs text-slate-400">
            هنوز حسابی را برای نمایش در صفحه اصلی انتخاب نکرده‌اید.
            <div className="mt-1">
              در ایجاد یا ویرایش حساب، تیک{" "}
              <span className="font-semibold text-sky-600">⭐ نمایش در صفحه اصلی</span> را فعال نمایید.
            </div>
          </div>
        }
      />

      {/* سرفصل‌های منتخب — قابل چینش */}
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

      {/* تراکنش‌های اخیر */}
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
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>تراکنش آخر</span>
          </label>
        </div>

        {recentTxs.length === 0 ? (
          <div className="p-5 rounded-2xl bg-white border border-slate-100 text-center text-xs text-slate-400">
            تراکنشی یافت نشد. با دکمه بالا اولین تراکنش را ثبت نمایید.
          </div>
        ) : (
          <div className="ios-card divide-y divide-slate-100 overflow-hidden">
            {recentTxs.map((tx) => {
              const isExp = tx.type === "expense";
              const isInc = tx.type === "income";

              return (
                <div
                  key={tx.id}
                  onClick={() => onSelectTx(tx)}
                  className="p-3 hover:bg-sky-50/60 cursor-pointer transition flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isExp
                          ? "bg-rose-50 text-rose-600"
                          : isInc
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-sky-50 text-sky-600"
                      }`}
                    >
                      {isExp ? (
                        <ArrowDownRight className="w-4 h-4" />
                      ) : isInc ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <ArrowRightLeft className="w-4 h-4" />
                      )}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {tx.description || (isExp ? "پرداخت هزینه" : isInc ? "دریافت درآمد" : "انتقال وجه")}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>{tx.shamsiDate}</span>
                        <span>•</span>
                        <span className="truncate">
                          {accLabel(tx.fromAccount)} ⟵ {accLabel(tx.toAccount)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <div
                      className={`text-xs font-extrabold dir-ltr ${
                        isExp ? "text-rose-600" : isInc ? "text-emerald-600" : "text-sky-600"
                      }`}
                    >
                      {formatMoney(tx.amount)}
                    </div>
                    {(tx.fee || 0) > 0 && (
                      <div className="text-[9px] text-amber-600 dir-ltr">
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
