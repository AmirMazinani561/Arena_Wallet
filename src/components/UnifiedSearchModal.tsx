"use client";

import { blurOnEnter, useModalViewportStyle } from "@/lib/use-visual-viewport";
import { useLockBodyScroll } from "@/lib/use-lock-body-scroll";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Account, Transaction } from "@/types";
import { formatMoney } from "@/lib/date-utils";
import {
  Search,
  X,
  CreditCard,
  Tag,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRightLeft,
  Calendar,
  Loader2,
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  allAccounts: Account[];
  onSelectAccount?: (account: Account) => void;
  onSelectTransaction?: (tx: Transaction) => void;
}

/**
 * جستجوی یکپارچه: حساب‌ها در سمت کلاینت (تعدادشان کم است) و
 * تراکنش‌ها در سمت سرور جستجو می‌شوند تا با رشد داده‌ها سرعت حفظ شود.
 */
/** نمایش نام حساب به همراه سرگروه: «سرگروه ← زیرمجموعه» */
function accLabel(a?: { name: string; parentName?: string } | null): string {
  if (!a) return "";
  return a.parentName ? `${a.parentName} ← ${a.name}` : a.name;
}

export function UnifiedSearchModal({
  isOpen,
  onClose,
  allAccounts,
  onSelectAccount,
  onSelectTransaction,
}: Props) {
  useLockBodyScroll(isOpen);
  const viewportStyle = useModalViewportStyle(isOpen);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [txResults, setTxResults] = useState<Transaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const term = debounced.trim();
    if (!term) {
      setTxResults([]);
      setTxTotal(0);
      return;
    }

    const current = ++requestId.current;
    setLoading(true);
    fetch(`/api/transactions?query=${encodeURIComponent(term)}&limit=25`)
      .then((r) => r.json())
      .then((data) => {
        if (current !== requestId.current) return;
        setTxResults(data.transactions || []);
        setTxTotal(data.total || 0);
      })
      .catch(console.error)
      .finally(() => {
        if (current === requestId.current) setLoading(false);
      });
  }, [debounced, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setDebounced("");
      setTxResults([]);
      setTxTotal(0);
    }
  }, [isOpen]);

  const matchedAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allAccounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.detailInfo?.toLowerCase().includes(q) ?? false)
    );
  }, [query, allAccounts]);

  if (!isOpen) return null;

  const typeLabel = (acc: Account) =>
    acc.type === "bank"
      ? "بانک"
      : acc.type === "cash"
      ? "صندوق"
      : acc.type === "person"
      ? "شخص"
      : acc.type === "expense"
      ? acc.isParent
        ? "سرفصل هزینه"
        : "زیرمجموعه هزینه"
      : acc.isParent
      ? "سرفصل درآمد"
      : "زیرمجموعه درآمد";

  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }} />
    <div style={viewportStyle} className="z-[51] flex justify-center pointer-events-none">
      <div
        className="w-full max-w-lg h-full bg-white shadow-2xl flex flex-col pointer-events-auto sm:my-3 sm:h-[calc(100%-1.5rem)] sm:rounded-3xl sm:border sm:border-sky-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 pb-3 bg-gradient-to-r from-sky-600 to-sky-500 flex items-center gap-3 text-white" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <Search className="w-5 h-5 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی همه‌چیز: حساب، سرفصل، شرح تراکنش، مبلغ…"
            onKeyDown={blurOnEnter}
            enterKeyHint="search"
            className="flex-1 bg-white/20 placeholder-white/70 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:bg-white/30 transition"
          />
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-white/20 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto overscroll-contain flex-1 min-h-0 space-y-4">
          {!query.trim() ? (
            <div className="py-12 text-center text-xs text-slate-400">
              عبارت مورد نظر را تایپ کنید تا در تمام حساب‌ها، سرفصل‌ها و تراکنش‌ها جستجو شود.
            </div>
          ) : (
            <>
              {matchedAccounts.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-sky-900 mb-2 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-sky-600" />
                    <span>حساب‌ها و سرفصل‌ها ({matchedAccounts.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {matchedAccounts.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          if (onSelectAccount) onSelectAccount(acc);
                          onClose();
                        }}
                        className="w-full text-right p-2.5 rounded-xl bg-slate-50 hover:bg-sky-50 border border-slate-100 flex items-center justify-between transition"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                            <span className="truncate">{acc.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 shrink-0">
                              {typeLabel(acc)}
                            </span>
                          </div>
                          {acc.detailInfo && (
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate">{acc.detailInfo}</div>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-sky-700 dir-ltr shrink-0">
                          {acc.balance !== undefined ? formatMoney(acc.balance) : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs font-bold text-sky-900 mb-2 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-sky-600" />
                  <span>تراکنش‌ها {txTotal > 0 ? `(${formatMoney(txTotal)})` : ""}</span>
                  {loading && <Loader2 className="w-3 h-3 animate-spin text-sky-500" />}
                </div>

                {!loading && txResults.length === 0 ? (
                  <div className="text-[11px] text-slate-400 py-2">تراکنشی یافت نشد.</div>
                ) : (
                  <div className="space-y-1.5">
                    {txResults.map((tx) => (
                      <button
                        key={tx.id}
                        type="button"
                        onClick={() => {
                          if (onSelectTransaction) onSelectTransaction(tx);
                          onClose();
                        }}
                        className="w-full text-right p-2.5 rounded-xl bg-slate-50 hover:bg-sky-50 border border-slate-100 flex items-center justify-between transition"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-xs font-bold text-slate-800 truncate">
                            {tx.description || "بدون شرح"}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {tx.shamsiDate}
                            </span>
                            <span className="truncate">
                              {accLabel(tx.fromAccount)} ⟵ {accLabel(tx.toAccount)}
                            </span>
                          </div>
                        </div>

                        <div className="text-left shrink-0">
                          <div
                            className={`text-xs font-bold dir-ltr flex items-center justify-end gap-1 ${
                              tx.type === "expense"
                                ? "text-rose-600"
                                : tx.type === "income"
                                ? "text-emerald-600"
                                : "text-sky-600"
                            }`}
                          >
                            <span>{formatMoney(tx.amount)}</span>
                            {tx.type === "expense" ? (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            ) : tx.type === "income" ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
