"use client";

import React, { useState, useEffect } from "react";
import { Account } from "@/types";
import { formatMoney } from "@/lib/date-utils";
import {
  CreditCard,
  Wallet,
  Users,
  TrendingDown,
  TrendingUp,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Check,
  GripVertical,
} from "lucide-react";

interface Props {
  title: string;
  dotColor: string;
  badgeCls: string;
  items: Account[];
  onAccountAction: (acc: Account) => void;
  onSaveOrder: (ids: string[]) => Promise<void>;
  headerAction?: React.ReactNode;
  emptyState?: React.ReactNode;
}

function RowIcon({ acc }: { acc: Account }) {
  const cls = "w-5 h-5";
  if (acc.type === "bank")
    return <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0"><CreditCard className={cls} /></div>;
  if (acc.type === "cash")
    return <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><Wallet className={cls} /></div>;
  if (acc.type === "person")
    return <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><Users className={cls} /></div>;
  if (acc.type === "expense")
    return <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0"><TrendingDown className={cls} /></div>;
  return <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><TrendingUp className={cls} /></div>;
}

function subtitleOf(acc: Account): string {
  const bal = acc.balance ?? acc.initialBalance;
  switch (acc.type) {
    case "bank":
      return acc.detailInfo || "حساب بانکی";
    case "cash":
      return acc.detailInfo || "صندوق وجه نقد";
    case "person":
      return bal > 0 ? "طلب ما از این شخص" : bal < 0 ? "بدهی ما به این شخص" : "تسویه شده";
    case "expense":
      return acc.isParent ? "سرفصل هزینه (شامل زیرمجموعه‌ها)" : "زیرمجموعه هزینه";
    default:
      return acc.isParent ? "سرفصل درآمد (شامل زیرمجموعه‌ها)" : "زیرمجموعه درآمد";
  }
}

function amountOf(acc: Account): { text: string; cls: string } {
  if (acc.type === "expense") return { text: formatMoney(acc.totalFlow || 0), cls: "text-rose-600" };
  if (acc.type === "income") return { text: formatMoney(acc.totalFlow || 0), cls: "text-emerald-600" };
  const bal = acc.balance ?? acc.initialBalance;
  if (acc.type === "person")
    return {
      text: formatMoney(Math.abs(bal)),
      cls: bal > 0 ? "text-emerald-600" : bal < 0 ? "text-rose-600" : "text-slate-500",
    };
  return { text: formatMoney(bal), cls: "text-slate-800" };
}

/**
 * لیست حساب‌های منتخب با حالت «چینش»:
 * دکمه‌های بالا/پایین برای جابه‌جایی، سپس ذخیره ترتیب در سرور.
 */
export function FavoritesList({
  title,
  dotColor,
  badgeCls,
  items,
  onAccountAction,
  onSaveOrder,
  headerAction,
  emptyState,
}: Props) {
  const [reordering, setReordering] = useState(false);
  const [draft, setDraft] = useState<Account[]>(items);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!reordering) setDraft(items);
  }, [items, reordering]);

  const move = (index: number, dir: -1 | 1) => {
    const next = [...draft];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSaveOrder(draft.map((a) => a.id));
      setReordering(false);
    } finally {
      setSaving(false);
    }
  };

  const list = reordering ? draft : items;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          <h3 className="text-xs font-bold text-slate-700">{title}</h3>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeCls}`}>
            {items.length} مورد
          </span>
        </div>

        <div className="flex items-center gap-2">
          {items.length > 1 &&
            (reordering ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(items);
                    setReordering(false);
                  }}
                  disabled={saving}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="text-[11px] font-bold text-white bg-sky-600 hover:bg-sky-700 px-2.5 py-1 rounded-lg flex items-center gap-1 disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{saving ? "ذخیره…" : "ذخیره ترتیب"}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setReordering(true)}
                className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>چینش</span>
              </button>
            ))}
          {!reordering && headerAction}
        </div>
      </div>

      {list.length === 0 ? (
        emptyState ?? null
      ) : (
        <div className={`space-y-2 ${reordering ? "p-2 rounded-2xl bg-sky-50/40 border border-sky-200" : ""}`}>
          {list.map((acc, idx) => {
            const amt = amountOf(acc);
            const isFirst = idx === 0;
            const isLast = idx === list.length - 1;

            return (
              <div
                key={acc.id}
                className={`bg-white rounded-2xl border border-sky-200 shadow-xs flex items-center transition hover:border-sky-300 ${
                  reordering ? "bg-sky-50/40" : ""
                }`}
              >
                {reordering && (
                  <div className="flex flex-col items-center pr-2 py-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={isFirst}
                      className="w-8 h-7 flex items-center justify-center rounded-lg text-sky-700 hover:bg-sky-100 disabled:opacity-25 active:scale-90"
                      aria-label="بالا"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={isLast}
                      className="w-8 h-7 flex items-center justify-center rounded-lg text-sky-700 hover:bg-sky-100 disabled:opacity-25 active:scale-90"
                      aria-label="پایین"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => !reordering && onAccountAction(acc)}
                  disabled={reordering}
                  className={`flex-1 min-w-0 text-right p-3.5 flex items-center justify-between gap-2 transition rounded-2xl ${
                    reordering ? "cursor-default" : "hover:bg-sky-50/40 active:scale-[0.995]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <RowIcon acc={acc} />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1 truncate">
                        <span className="truncate">{acc.name}</span>
                        {!reordering && <span className="text-[10px] text-amber-500 shrink-0">★</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{subtitleOf(acc)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className={`text-sm font-extrabold dir-ltr ${amt.cls}`}>{amt.text}</div>
                    {reordering ? (
                      <GripVertical className="w-4 h-4 text-slate-300" />
                    ) : (
                      <ChevronLeft className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
