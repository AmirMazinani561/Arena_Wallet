"use client";

import { blurOnEnter } from "@/lib/use-visual-viewport";
import React, { useState, useMemo } from "react";
import { Account, AccountType } from "@/types";
import { formatMoney } from "@/lib/date-utils";
import { Search, Plus, Landmark, Wallet, Users, X } from "lucide-react";
import { CategoryTree } from "./CategoryTree";
import { RowActionsMenu, RowAction } from "./RowActionsMenu";

interface Props {
  accounts: Account[];
  onOpenCreateModal: (type: AccountType, parentId?: string | null) => void;
  onOpenEditModal: (account: Account) => void;
  onDeleteAccount: (id: string) => void;
  onToggleFavorite: (account: Account) => void;
  onFilterTransactions: (accountId: string) => void;
}

type Tab = "banking" | "person" | "expense" | "income";

export function AccountsTab({
  accounts,
  onOpenCreateModal,
  onOpenEditModal,
  onDeleteAccount,
  onToggleFavorite,
  onFilterTransactions,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("banking");
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const matches = (a: Account) =>
    !q || a.name.toLowerCase().includes(q) || (a.detailInfo?.toLowerCase().includes(q) ?? false);

  const banksAndCash = useMemo(
    () => accounts.filter((a) => (a.type === "bank" || a.type === "cash") && matches(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, q]
  );
  const persons = useMemo(
    () => accounts.filter((a) => a.type === "person" && matches(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, q]
  );
  const expenses = useMemo(() => accounts.filter((a) => a.type === "expense"), [accounts]);
  const incomes = useMemo(() => accounts.filter((a) => a.type === "income"), [accounts]);

  /** منوی عملیات برای هر حساب */
  const actionsFor = (acc: Account, isParentRow: boolean): RowAction[] => {
    const list: RowAction[] = [];
    if (isParentRow) {
      list.push({
        key: "add-child",
        label: "افزودن زیرمجموعه",
        icon: "add",
        onClick: () => onOpenCreateModal(acc.type, acc.id),
      });
    }
    list.push(
      {
        key: "fav",
        label: acc.isFavorite ? "حذف از صفحه اصلی" : "نمایش در صفحه اصلی",
        icon: "star",
        active: acc.isFavorite,
        onClick: () => onToggleFavorite(acc),
      },
      { key: "ledger", label: "گزارش / گردش", icon: "ledger", onClick: () => onFilterTransactions(acc.id) },
      { key: "edit", label: "ویرایش", icon: "edit", onClick: () => onOpenEditModal(acc) },
      {
        key: "del",
        label: "حذف",
        icon: "delete",
        danger: true,
        onClick: () => {
          if (confirm(`آیا از حذف «${acc.name}» اطمینان دارید؟`)) onDeleteAccount(acc.id);
        },
      }
    );
    return list;
  };

  const createType: AccountType =
    activeTab === "banking" ? "bank" : activeTab === "person" ? "person" : activeTab;

  const tabs: { key: Tab; label: string; color: string }[] = [
    { key: "banking", label: "بانک و صندوق", color: "text-sky-700" },
    { key: "person", label: "اشخاص", color: "text-purple-700" },
    { key: "expense", label: "هزینه", color: "text-rose-700" },
    { key: "income", label: "درآمد", color: "text-emerald-700" },
  ];

  const renderAssetRow = (acc: Account) => {
    const isBank = acc.type === "bank";
    const isPerson = acc.type === "person";
    const bal = acc.balance ?? acc.initialBalance;
    const balColor = isPerson
      ? bal > 0
        ? "text-emerald-600"
        : bal < 0
        ? "text-rose-600"
        : "text-slate-500"
      : "text-slate-900";

    return (
      <div key={acc.id} className="ios-card flex items-stretch">
        <button
          type="button"
          onClick={() => onFilterTransactions(acc.id)}
          className="flex-1 min-w-0 text-right p-3 flex items-center gap-2.5 hover:bg-slate-50/70 transition rounded-r-[1.25rem]"
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isPerson
                ? "bg-purple-50 text-purple-600"
                : isBank
                ? "bg-sky-50 text-sky-600"
                : "bg-emerald-50 text-emerald-600"
            }`}
          >
            {isPerson ? <Users className="w-4 h-4" /> : isBank ? <Landmark className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-800 truncate flex items-center gap-1.5">
              <span className="truncate">{acc.name}</span>
              {acc.isFavorite && <span className="text-[10px] text-amber-500 shrink-0">★</span>}
            </div>
            {acc.detailInfo && <div className="text-[10px] text-slate-400 truncate mt-0.5">{acc.detailInfo}</div>}
          </div>
          <div className="text-left shrink-0">
            <div className={`text-sm font-extrabold dir-ltr ${balColor}`}>{formatMoney(Math.abs(bal))}</div>
            {isPerson && (
              <div className="text-[9px] text-slate-400">{bal > 0 ? "طلب ما" : bal < 0 ? "بدهی ما" : "تسویه"}</div>
            )}
          </div>
        </button>
        <div className="flex items-center pl-2 shrink-0">
          <RowActionsMenu
            title={acc.name}
            subtitle={isPerson ? "شخص / طرف حساب" : isBank ? "حساب بانکی" : "صندوق وجه نقد"}
            actions={actionsFor(acc, false)}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-6 animate-in fade-in duration-150">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">حساب‌ها</h2>
        <button
          type="button"
          onClick={() => onOpenCreateModal(createType)}
          className="py-2 px-3.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-sky-200 transition flex items-center gap-1.5 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>حساب جدید</span>
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-2xl text-[11px] font-semibold">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`py-2 rounded-xl transition ${
              activeTab === t.key ? `bg-white ${t.color} shadow-sm font-bold` : "text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={blurOnEnter}
          enterKeyHint="search"
          placeholder="جستجو…"
          className="w-full pr-9 pl-9 py-2.5 text-xs bg-white border border-sky-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm appearance-none"
        />
        <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute left-2 top-2 w-6 h-6 flex items-center justify-center text-slate-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {activeTab === "banking" &&
        (banksAndCash.length === 0 ? (
          <div className="p-8 rounded-3xl bg-white border border-sky-100 text-center text-xs text-slate-400">
            حساب بانک یا صندوقی یافت نشد.
          </div>
        ) : (
          <div className="space-y-2">{banksAndCash.map(renderAssetRow)}</div>
        ))}

      {activeTab === "person" &&
        (persons.length === 0 ? (
          <div className="p-8 rounded-3xl bg-white border border-sky-100 text-center text-xs text-slate-400">
            حساب شخصی یافت نشد.
          </div>
        ) : (
          <div className="space-y-2">{persons.map(renderAssetRow)}</div>
        ))}

      {(activeTab === "expense" || activeTab === "income") && (
        <CategoryTree
          accounts={activeTab === "expense" ? expenses : incomes}
          search={search}
          tone={activeTab === "expense" ? "rose" : "emerald"}
          onSelectChild={(c) => onFilterTransactions(c.id)}
          renderTrailing={(acc, isParentRow) => (
            <>
              <span className="text-xs font-bold text-slate-700 dir-ltr ml-1">{formatMoney(acc.totalFlow || 0)}</span>
              <RowActionsMenu
                title={acc.name}
                subtitle={isParentRow ? "سرفصل اصلی" : "زیرمجموعه"}
                actions={actionsFor(acc, isParentRow)}
              />
            </>
          )}
          emptyText={`سرفصلی برای ${activeTab === "expense" ? "هزینه" : "درآمد"} تعریف نشده است.`}
        />
      )}
    </div>
  );
}
