"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Account } from "@/types";
import { ChevronDown, Layers, Tag } from "lucide-react";
import { formatMoney } from "@/lib/date-utils";

export interface CategoryTreeProps {
  /** فقط حساب‌های همان نوع (expense یا income) */
  accounts: Account[];
  /** عبارت جستجو — با وجود آن، سرفصل‌های منطبق به‌طور خودکار باز می‌شوند */
  search?: string;
  /** رندر سمت چپ هر ردیف (مثلاً مبلغ یا منوی عملیات) */
  renderTrailing?: (acc: Account, isParent: boolean) => React.ReactNode;
  /** کلیک روی زیرمجموعه */
  onSelectChild?: (acc: Account) => void;
  /** کلیک روی خود سرفصل (اختیاری) */
  onSelectParent?: (acc: Account) => void;
  /** آیا سرفصل قابل انتخاب است یا فقط باز/بسته می‌شود */
  parentSelectable?: boolean;
  /** شناسه‌ی انتخاب‌شده برای هایلایت */
  selectedId?: string | null;
  /** رنگ تم: rose برای هزینه، emerald برای درآمد */
  tone: "rose" | "emerald";
  emptyText?: string;
}

/**
 * نمایش درختی سرفصل ← زیرمجموعه‌ها.
 * سرفصل‌ها به‌صورت پیش‌فرض بسته‌اند و با کلیک باز می‌شوند.
 * هنگام جستجو، فقط سرفصل‌های دارای نتیجه نمایش داده و خودکار باز می‌شوند.
 */
export function CategoryTree({
  accounts,
  search = "",
  renderTrailing,
  onSelectChild,
  onSelectParent,
  parentSelectable = false,
  selectedId,
  tone,
  emptyText = "موردی یافت نشد.",
}: CategoryTreeProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const q = search.trim().toLowerCase();

  const { parents, childrenOf } = useMemo(() => {
    const collator = new Intl.Collator("fa");
    const ids = new Set(accounts.map((a) => a.id));
    // والد = هر حسابی که parentId ندارد، یا parentId آن به حسابی اشاره می‌کند که در لیست نیست (یتیم)
    // این‌طور هیچ رکوردی از داده‌های واردشده‌ی کاربر از دید پنهان نمی‌ماند.
    const parents = accounts
      .filter((a) => !a.parentId || !ids.has(a.parentId))
      .sort((a, b) => collator.compare(a.name, b.name));
    const childrenOf = new Map<string, Account[]>();
    for (const a of accounts) {
      if (a.parentId && ids.has(a.parentId)) {
        const arr = childrenOf.get(a.parentId) || [];
        arr.push(a);
        childrenOf.set(a.parentId, arr);
      }
    }
    for (const [k, arr] of childrenOf) childrenOf.set(k, arr.sort((a, b) => collator.compare(a.name, b.name)));
    return { parents, childrenOf };
  }, [accounts]);

  // با جستجو: فیلتر و باز کردن خودکار
  const visible = useMemo(() => {
    if (!q) return parents.map((p) => ({ parent: p, children: childrenOf.get(p.id) || [] }));
    const out: { parent: Account; children: Account[] }[] = [];
    for (const p of parents) {
      const kids = childrenOf.get(p.id) || [];
      const parentMatch = p.name.toLowerCase().includes(q);
      const matchedKids = kids.filter((c) => c.name.toLowerCase().includes(q));
      if (parentMatch) out.push({ parent: p, children: kids });
      else if (matchedKids.length) out.push({ parent: p, children: matchedKids });
    }
    return out;
  }, [q, parents, childrenOf]);

  useEffect(() => {
    if (!q) return;
    const next: Record<string, boolean> = {};
    for (const v of visible) next[v.parent.id] = true;
    setOpen((prev) => ({ ...prev, ...next }));
  }, [q, visible]);

  const toneCls =
    tone === "rose"
      ? { badge: "bg-rose-100 text-rose-700", dot: "bg-rose-400", ring: "ring-rose-200" }
      : { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400", ring: "ring-emerald-200" };

  if (visible.length === 0) {
    return <div className="p-6 text-center text-xs text-slate-400">{emptyText}</div>;
  }

  return (
    <div className="space-y-2">
      {visible.map(({ parent, children }) => {
        const isOpen = q ? true : Boolean(open[parent.id]);
        const isSel = selectedId === parent.id;
        return (
          <div key={parent.id} className={`ios-card overflow-hidden ${isSel ? `ring-2 ${toneCls.ring}` : ""}`}>
            {/* ردیف سرفصل */}
            <div className="flex items-stretch">
              <button
                type="button"
                onClick={() => {
                  if (parentSelectable && onSelectParent) onSelectParent(parent);
                  else setOpen((o) => ({ ...o, [parent.id]: !o[parent.id] }));
                }}
                className="flex-1 min-w-0 text-right p-3 flex items-center gap-2.5 hover:bg-slate-50/70 active:bg-slate-100 transition"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${toneCls.badge}`}>
                  <Layers className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800 truncate">{parent.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 flex-wrap">
                    <span>{children.length === 0 ? "بدون زیرمجموعه" : `${children.length} زیرمجموعه`}</span>
                    {parent.isFavorite ? <span>• ★ منتخب</span> : null}
                    {parent.monthlyBudget && parent.monthlyBudget > 0 ? (
                      <span className="text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200/60 font-semibold">
                        سقف: {formatMoney(parent.monthlyBudget)} ریال
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-1 pl-2 shrink-0">
                {renderTrailing?.(parent, true)}
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [parent.id]: !o[parent.id] }))}
                  className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg"
                  aria-label={isOpen ? "بستن" : "باز کردن"}
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>

            {/* زیرمجموعه‌ها */}
            {isOpen && children.length > 0 && (
              <div className="border-t border-slate-100 bg-slate-50/40">
                {children.map((c) => {
                  const selC = selectedId === c.id;
                  return (
                    <div
                      key={c.id}
                      className={`flex items-stretch border-b border-slate-100 last:border-b-0 ${
                        selC ? "bg-sky-50" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectChild?.(c)}
                        className="flex-1 min-w-0 text-right py-2.5 pr-5 pl-3 flex items-center gap-2 hover:bg-white/70 active:bg-white transition"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${toneCls.dot}`} />
                        <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-xs font-medium text-slate-700 truncate">{c.name}</span>
                        {c.isFavorite && <span className="text-[10px] text-amber-500">★</span>}
                      </button>
                      {renderTrailing && (
                        <div className="flex items-center gap-1 pl-2 shrink-0">{renderTrailing(c, false)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
