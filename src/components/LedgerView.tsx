"use client";

import { blurOnEnter } from "@/lib/use-visual-viewport";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Account } from "@/types";
import { formatMoney, getCurrentShamsi, buildShamsi, shamsiMonthEnd, toPersianDigits } from "@/lib/date-utils";
import { Search, X, ArrowRight, SlidersHorizontal, Loader2, FileSpreadsheet, Printer } from "lucide-react";
import { ShamsiDatePicker } from "./ShamsiDatePicker";

const PAGE_SIZE = 40;

export interface LedgerRow {
  id: string;
  type: string;
  amount: number;
  fee: number;
  date: string;
  shamsiDate: string;
  description: string | null;
  trackingNumber: string | null;
  direction: "in" | "out";
  counterpartyId: string;
  counterpartyName: string;
  counterpartyParentName: string | null;
  balanceAfter: number;
}

export function ExcelIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.5 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V7.5L14.5 2Z" fill="#107C41" />
      <path d="M14 2V8H20" fill="#21A366" />
      <path d="M7.5 11.5L10.5 16.5M10.5 11.5L7.5 16.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13 12H17M13 14H17M13 16H17" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function PdfIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.5 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V7.5L14.5 2Z" fill="#E11D48" />
      <path d="M14 2V8H20" fill="#BE123C" />
      <path d="M7 13.5C7 12.67 7.67 12 8.5 12H9.5C10.33 12 11 12.67 11 13.5V14C11 14.83 10.33 15.5 9.5 15.5H8.2V17H7V13.5ZM8.2 14.3H9.4C9.62 14.3 9.8 14.12 9.8 13.9V13.6C9.8 13.38 9.62 13.2 9.4 13.2H8.2V14.3Z" fill="white" />
      <path d="M12.5 12H14C15.1 12 16 12.9 16 14V15C16 16.1 15.1 17 14 17H12.5V12ZM13.7 15.8H14C14.44 15.8 14.8 15.44 14.8 15V14C14.8 13.56 14.44 13.2 14 13.2H13.7V15.8Z" fill="white" />
    </svg>
  );
}

interface Props {
  account: Account;
  allAccounts?: Account[];
  onBack: () => void;
  onEditTx: (txId: string) => void;
  reloadToken: number;
}

/**
 * گردش حساب با مانده لحظه‌ای — نمای «صورت‌حساب» برای بانک، صندوق، اشخاص و سرفصل‌ها
 */
export function LedgerView({ account, allAccounts, onBack, onEditTx, reloadToken }: Props) {
  const today = getCurrentShamsi();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [dateFilterOn, setDateFilterOn] = useState(false);
  const [startDate, setStartDate] = useState(buildShamsi(today.jy, today.jm, 1));
  const [endDate, setEndDate] = useState(shamsiMonthEnd(today.jy, today.jm));

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isAsset, setIsAsset] = useState(true);
  const [closingBalance, setClosingBalance] = useState(0);
  const [serverParentName, setServerParentName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback(
    (offset: number) => {
      const p = new URLSearchParams();
      p.set("accountId", account.id);
      p.set("limit", String(PAGE_SIZE));
      p.set("offset", String(offset));
      if (debounced.trim()) p.set("query", debounced.trim());
      if (dateFilterOn) {
        p.set("startDate", startDate);
        p.set("endDate", endDate);
      }
      return p.toString();
    },
    [account.id, debounced, dateFilterOn, startDate, endDate]
  );

  useEffect(() => {
    const current = ++requestId.current;
    setLoading(true);
    fetch(`/api/ledger?${buildParams(0)}`)
      .then((r) => r.json())
      .then((d) => {
        if (current !== requestId.current) return;
        setRows(d.rows || []);
        setTotal(d.total || 0);
        setIsAsset(Boolean(d.isAsset));
        setClosingBalance(d.closingBalance || 0);
        if (d.account?.parentName) setServerParentName(d.account.parentName);
      })
      .catch(console.error)
      .finally(() => {
        if (current === requestId.current) setLoading(false);
      });
  }, [buildParams, reloadToken]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/ledger?${buildParams(rows.length)}`);
      const d = await r.json();
      setRows((prev) => [...prev, ...(d.rows || [])]);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleExportCsv = () => {
    const todayStr = buildShamsi(today.jy, today.jm, today.jd).replace(/\//g, "-");
    const defaultName = `صورت_حساب_${account.name.replace(/[\\/:*?"<>|\s]/g, "_")}_${todayStr}`;
    const chosenName = prompt("نام فایل اکسل را وارد فرمایید:", defaultName);
    if (chosenName === null) return; // کاربر انصراف داد

    const p = new URLSearchParams();
    p.set("accountId", account.id);
    p.set("limit", "10000");
    if (debounced.trim()) p.set("query", debounced.trim());
    if (dateFilterOn) {
      p.set("startDate", startDate);
      p.set("endDate", endDate);
    }
    p.set("format", "csv");
    if (chosenName.trim()) {
      p.set("fileName", chosenName.trim());
    }
    window.location.href = `/api/ledger?${p.toString()}`;
  };

  const handlePrintPdf = () => {
    const p = new URLSearchParams();
    p.set("accountId", account.id);
    p.set("limit", "10000");
    if (debounced.trim()) p.set("query", debounced.trim());
    if (dateFilterOn) {
      p.set("startDate", startDate);
      p.set("endDate", endDate);
    }
    p.set("format", "print");
    window.open(`/api/ledger?${p.toString()}`, "_blank");
  };

  const parentName =
    serverParentName ||
    (account.parentId && allAccounts ? allAccounts.find((a) => a.id === account.parentId)?.name : null);

  return (
    <div className="space-y-3 pb-6 animate-in fade-in duration-150">
      {/* هدر — کاملاً وسط‌چین با نمایش «نام زیرمجموعه ← نام سرفصل» بدون هیچ زیرنویس اضافه */}
      <div className="relative ios-card p-4 text-center">
        <button
          type="button"
          onClick={onBack}
          className="absolute right-2 top-2 p-2 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition"
          aria-label="بازگشت"
        >
          <ArrowRight className="w-5 h-5" />
        </button>

        <div className="text-[11px] text-slate-400">گزارش حساب</div>
        <h2 className="text-base font-bold text-slate-800 mt-1 px-8 flex items-center justify-center gap-1.5 flex-wrap">
          <span>{account.name}</span>
          {parentName && (
            <>
              <span className="text-slate-400 text-sm">←</span>
              <span className="text-slate-600 font-semibold">{parentName}</span>
            </>
          )}
        </h2>

        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="text-[10px] text-slate-400">{isAsset ? "مانده فعلی" : "جمع گردش"}</div>
          <div
            className={`text-xl font-extrabold dir-ltr mt-0.5 ${
              isAsset && closingBalance < 0 ? "text-rose-600" : "text-slate-800"
            }`}
          >
            {formatMoney(closingBalance)}
          </div>
        </div>
      </div>

      {/* جستجو + فیلتر تاریخ + خروجی اکسل و چاپ/PDF */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[170px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو در شرح، مبلغ، طرف حساب…"
            onKeyDown={blurOnEnter}
            enterKeyHint="search"
            className="w-full pr-9 pl-8 py-2.5 text-xs bg-white border border-sky-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute left-3 top-3 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDateFilterOn(!dateFilterOn)}
          className={`px-3 py-2.5 rounded-2xl text-xs font-semibold transition flex items-center gap-1 shrink-0 ${
            dateFilterOn
              ? "bg-amber-500 text-white shadow-sm"
              : "bg-white text-slate-600 border border-sky-100 shadow-sm"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>تاریخ</span>
        </button>
        <button
          type="button"
          onClick={handleExportCsv}
          className="px-3 py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-2xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition shadow-sm"
          title="خروجی اکسل این صورت‌حساب"
        >
          <ExcelIcon className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">اکسل</span>
        </button>
        <button
          type="button"
          onClick={handlePrintPdf}
          className="px-3 py-2.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-2xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition shadow-sm"
          title="چاپ یا ذخیره به عنوان PDF"
        >
          <PdfIcon className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">PDF</span>
        </button>
      </div>

      {dateFilterOn && (
        <div className="ios-card p-3 space-y-2.5">
          <ShamsiDatePicker label="از تاریخ" value={startDate} onChange={setStartDate} showTodayButton={false} />
          <ShamsiDatePicker label="تا تاریخ" value={endDate} onChange={setEndDate} showTodayButton={false} />
        </div>
      )}

      {/* لیست گردش */}
      {loading ? (
        <div className="py-12 text-center">
          <Loader2 className="w-6 h-6 text-sky-500 animate-spin mx-auto" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 rounded-3xl bg-white border border-sky-100 text-center text-xs text-slate-400">
          تراکنشی برای این حساب یافت نشد.
        </div>
      ) : (
        <>
          <div className="ios-card divide-y divide-slate-100 overflow-hidden">
            {rows.map((r) => {
              const isIn = r.direction === "in";
              // برای سرفصل‌ها: هزینه = پرداخت، درآمد = دریافت
              const label = isAsset
                ? isIn
                  ? "دریافت"
                  : "پرداخت"
                : account.type === "expense"
                ? "پرداخت"
                : "دریافت";
              const labelIsGreen = label === "دریافت";
              const amountIsGreen = isAsset ? isIn : account.type === "income";

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onEditTx(r.id)}
                  className="w-full text-right p-3 hover:bg-sky-50/50 transition flex items-start justify-between gap-3"
                >
                  {/* سمت راست: تاریخ + نوع، مقصد، توضیحات */}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-slate-800 text-xs tracking-tight">
                        {toPersianDigits(r.shamsiDate)}
                      </span>
                      <span className={`font-bold text-[11px] ${labelIsGreen ? "text-emerald-600" : "text-rose-600"}`}>
                        {label}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-800 truncate flex items-center gap-1">
                      {r.counterpartyParentName && (
                        <>
                          <span className="text-slate-500 font-medium">{r.counterpartyParentName}</span>
                          <span className="text-slate-400">←</span>
                        </>
                      )}
                      <span>{r.counterpartyName}</span>
                    </div>
                    {r.description && (
                      <div className="text-[11px] text-slate-400 truncate">{r.description}</div>
                    )}
                  </div>

                  {/* سمت چپ: مبلغ، کارمزد، مانده */}
                  <div className="text-left shrink-0 space-y-0.5">
                    <div
                      className={`text-sm font-extrabold dir-ltr ${
                        amountIsGreen ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {formatMoney(r.amount)}
                    </div>
                    {r.fee > 0 && (
                      <div className="text-[10px] text-amber-600 dir-ltr font-semibold">
                        کارمزد {formatMoney(r.fee)}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500 dir-ltr">
                      {isAsset ? "مانده" : "تجمعی"}{" "}
                      <span className={`font-bold ${isAsset && r.balanceAfter < 0 ? "text-rose-600" : "text-slate-700"}`}>
                        {formatMoney(r.balanceAfter)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {rows.length < total && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-3 bg-white border border-sky-200 hover:bg-sky-50 text-sky-700 text-xs font-bold rounded-2xl transition flex items-center justify-center gap-2"
            >
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>نمایش بیشتر</span>}
            </button>
          )}
        </>
      )}
    </div>
  );
}
