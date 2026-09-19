"use client";

import { useLockBodyScroll } from "@/lib/use-lock-body-scroll";
import { useModalViewportStyle, blurOnEnter } from "@/lib/use-visual-viewport";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { Account, AccountType } from "@/types";
import { formatMoney } from "@/lib/date-utils";
import { Search, X, Plus, Landmark, Wallet, Users, ArrowDownRight, ArrowUpRight, Check } from "lucide-react";
import { CreateAccountModal } from "./CreateAccountModal";
import { CategoryTree } from "./CategoryTree";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (account: Account) => void;
  title?: string;
  allowedTypes?: AccountType[];
  selectedId?: string;
  allAccounts: Account[];
  onAccountCreated?: (newAccount: Account) => void;
  autoFocusInput?: boolean;
}

const TYPE_LABEL: Record<AccountType, string> = {
  bank: "بانک",
  cash: "صندوق",
  person: "شخص",
  expense: "هزینه",
  income: "درآمد",
};

function TypeIcon({ type }: { type: AccountType }) {
  switch (type) {
    case "bank":
      return <Landmark className="w-4 h-4 text-sky-600" />;
    case "cash":
      return <Wallet className="w-4 h-4 text-emerald-600" />;
    case "person":
      return <Users className="w-4 h-4 text-purple-600" />;
    case "expense":
      return <ArrowDownRight className="w-4 h-4 text-rose-500" />;
    default:
      return <ArrowUpRight className="w-4 h-4 text-emerald-500" />;
  }
}

/**
 * انتخابگر حساب — تمام‌صفحه، از بالای ناحیه‌ی قابل‌مشاهده شروع می‌شود.
 * هدر و کادر جستجو ثابت‌اند و فقط لیست نتایج (زیر کادر جستجو) اسکرول می‌شود.
 * ارتفاع با visualViewport هماهنگ است تا با باز شدن کیبورد هیچ‌چیز جابه‌جا نشود.
 */
export function AccountPickerModal({
  isOpen,
  onClose,
  onSelect,
  title = "انتخاب حساب",
  allowedTypes,
  selectedId,
  allAccounts,
  onAccountCreated,
  autoFocusInput = true,
}: Props) {
  useLockBodyScroll(isOpen);
  const viewportStyle = useModalViewportStyle(isOpen);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // با هر تغییر جستجو، لیست به بالا برمی‌گردد تا اولین نتیجه دقیقاً زیر کادر باشد
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [search, filterType]);

  // فوکوس آنی و انتقال کیبورد از پروکسی در گوشی‌ها (iOS Safari و Android)
  useEffect(() => {
    if (!isOpen || !autoFocusInput) return;
    inputRef.current?.focus({ preventScroll: true });
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, autoFocusInput]);

  const accountMap = useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of allAccounts) m.set(a.id, a);
    return m;
  }, [allAccounts]);

  const filteredList = useMemo(() => {
    let list = allAccounts;
    if (allowedTypes && allowedTypes.length > 0) list = list.filter((a) => allowedTypes.includes(a.type));
    if (filterType !== "all") list = list.filter((a) => a.type === filterType);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((a) => {
        const parentName = a.parentId ? accountMap.get(a.parentId)?.name.toLowerCase() || "" : "";
        return (
          a.name.toLowerCase().includes(q) ||
          (a.detailInfo?.toLowerCase().includes(q) ?? false) ||
          parentName.includes(q)
        );
      });
    }
    return list;
  }, [allAccounts, allowedTypes, filterType, search, accountMap]);

  // تفکیک: دارایی‌ها (لیست ساده) و سرفصل‌ها (درختی). برای درخت، والدها هم باید حضور داشته باشند.
  const assetList = filteredList.filter((a) => a.type === "bank" || a.type === "cash" || a.type === "person");
  const withParents = (type: "expense" | "income") => {
    const ids = new Set(filteredList.filter((a) => a.type === type).map((a) => a.id));
    for (const a of filteredList) if (a.type === type && a.parentId) ids.add(a.parentId);
    return allAccounts.filter((a) => a.type === type && ids.has(a.id));
  };
  const expenseList = withParents("expense");
  const incomeList = withParents("income");

  if (!isOpen) return null;

  const visibleTypes = (["bank", "cash", "person", "expense", "income"] as AccountType[]).filter(
    (t) => !allowedTypes || allowedTypes.includes(t)
  );

  const defaultCreateType: AccountType =
    allowedTypes && allowedTypes.length === 1
      ? allowedTypes[0]
      : filterType !== "all"
      ? (filterType as AccountType)
      : "bank";

  return (
    <>
      {/* پس‌زمینه */}
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }} />

      {/* بدنه‌ی مودال — دقیقاً به اندازه‌ی ناحیه‌ی قابل‌مشاهده */}
      <div style={viewportStyle} className="z-[61] flex justify-center pointer-events-none">
        <div
          className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col pointer-events-auto sm:my-3 sm:h-[calc(100%-1.5rem)] sm:rounded-3xl sm:border sm:border-sky-100 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* هدر ثابت */}
          <div
            className="shrink-0 bg-gradient-to-r from-sky-600 to-sky-500 text-white px-4 pb-3 flex items-center justify-between"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            <span className="font-bold text-base">{title}</span>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 -ml-2 flex items-center justify-center rounded-full hover:bg-white/20 transition"
              aria-label="بستن"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* کادر جستجو — ثابت زیر هدر */}
          <div className="shrink-0 p-3 bg-slate-50 border-b border-slate-100 space-y-2">
            <div className="relative">
              <input
                ref={inputRef}
                autoFocus={autoFocusInput}
                type="search"
                inputMode="search"
                enterKeyHint="done"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={blurOnEnter}
                placeholder="جستجوی نام حساب…"
                className="w-full pr-9 pl-9 py-2.5 text-[16px] sm:text-xs bg-white border border-sky-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition appearance-none"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
              {search && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSearch("");
                    inputRef.current?.focus({ preventScroll: true });
                  }}
                  className="absolute left-2 top-2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full"
                  aria-label="پاک کردن"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {visibleTypes.length > 1 && (
              <div className="flex gap-1 overflow-x-auto text-[11px] font-medium">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setFilterType("all")}
                  className={`px-2.5 py-1 rounded-lg shrink-0 transition ${
                    filterType === "all" ? "bg-sky-600 text-white" : "bg-white text-slate-600 border border-slate-200"
                  }`}
                >
                  همه
                </button>
                {visibleTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setFilterType(t)}
                    className={`px-2.5 py-1 rounded-lg shrink-0 transition ${
                      filterType === t ? "bg-sky-600 text-white" : "bg-white text-slate-600 border border-slate-200"
                    }`}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* نتایج — تنها بخش اسکرول‌شونده، دقیقاً زیر کادر جستجو */}
          <div
            ref={listRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {filteredList.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">حسابی با این مشخصات پیدا نشد.</div>
            ) : (
              <div className="space-y-3">
                {/* بانک، صندوق، اشخاص — لیست ساده */}
                {assetList.length > 0 && (
                  <div className="divide-y divide-slate-100">
                    {assetList.map((acc) => {
                      const isSelected = selectedId === acc.id;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => {
                            onSelect(acc);
                            onClose();
                          }}
                          className={`w-full text-right p-2.5 rounded-xl transition flex items-center justify-between gap-2 hover:bg-sky-50/70 active:bg-sky-100 ${
                            isSelected ? "bg-sky-50" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                              <TypeIcon type={acc.type} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-800 truncate">{acc.name}</div>
                              {acc.detailInfo && (
                                <div className="text-[10px] text-slate-400 truncate">{acc.detailInfo}</div>
                              )}
                            </div>
                          </div>
                          <div className="text-left shrink-0 flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-700 dir-ltr">
                              {formatMoney(acc.balance ?? acc.initialBalance)}
                            </span>
                            {isSelected && <Check className="w-4 h-4 text-sky-600" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* سرفصل‌های هزینه — درختی، بسته به‌صورت پیش‌فرض */}
                {expenseList.length > 0 && (
                  <div>
                    {assetList.length > 0 && (
                      <div className="text-[10px] font-bold text-rose-600 px-1 mb-1.5">سرفصل‌های هزینه</div>
                    )}
                    <CategoryTree
                      accounts={expenseList}
                      search={search}
                      tone="rose"
                      selectedId={selectedId}
                      parentSelectable
                      onSelectParent={(p) => {
                        onSelect(p);
                        onClose();
                      }}
                      onSelectChild={(c) => {
                        onSelect(c);
                        onClose();
                      }}
                    />
                  </div>
                )}

                {/* سرفصل‌های درآمد */}
                {incomeList.length > 0 && (
                  <div>
                    {(assetList.length > 0 || expenseList.length > 0) && (
                      <div className="text-[10px] font-bold text-emerald-600 px-1 mb-1.5">سرفصل‌های درآمد</div>
                    )}
                    <CategoryTree
                      accounts={incomeList}
                      search={search}
                      tone="emerald"
                      selectedId={selectedId}
                      parentSelectable
                      onSelectParent={(p) => {
                        onSelect(p);
                        onClose();
                      }}
                      onSelectChild={(c) => {
                        onSelect(c);
                        onClose();
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* دکمه ایجاد حساب — ثابت در پایین ناحیه‌ی قابل‌مشاهده */}
          <div
            className="shrink-0 p-3 border-t border-slate-100 bg-white"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                inputRef.current?.blur();
                // تأخیر کوتاه تا رویداد لمس فعلی تمام شود و روی مودال جدید نیفتد
                setTimeout(() => setIsCreateOpen(true), 0);
              }}
              className="w-full py-2.5 px-3 bg-sky-100 hover:bg-sky-200 text-sky-800 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition border border-sky-300/60"
            >
              <Plus className="w-4 h-4 text-sky-600" />
              <span>ایجاد حساب جدید</span>
            </button>
          </div>
        </div>
      </div>

      {isCreateOpen && (
        <CreateAccountModal
          key="picker-create"
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={(newAcc) => {
            if (newAcc) {
              onAccountCreated?.(newAcc);
              onSelect(newAcc);
              onClose();
            }
          }}
          initialType={defaultCreateType}
          allAccounts={allAccounts}
        />
      )}
    </>
  );
}
