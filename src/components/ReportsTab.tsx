"use client";

import { blurOnEnter } from "@/lib/use-visual-viewport";
import React, { useState, useEffect, useMemo } from "react";
import { ReportCategory, ReportSummary } from "@/types";
import { formatMoney, getCurrentShamsi, buildShamsi, shamsiMonthEnd, toPersianDigits } from "@/lib/date-utils";
import {
  TrendingUp,
  TrendingDown,
  PieChart,
  Calendar,
  ChevronDown,
  ChevronUp,
  Search,
  ExternalLink,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import { ShamsiDatePicker } from "./ShamsiDatePicker";
import { ExcelIcon, PdfIcon } from "./LedgerView";

interface Props {
  onFilterTransactionsByAccount: (accountId: string) => void;
  refreshKey?: number;
}

export function ReportsTab({ onFilterTransactionsByAccount, refreshKey = 0 }: Props) {
  const today = getCurrentShamsi();

  const [datePreset, setDatePreset] = useState<string>("this_month");
  const [customStart, setCustomStart] = useState<string>(buildShamsi(today.jy, today.jm, 1));
  const [customEnd, setCustomEnd] = useState<string>(shamsiMonthEnd(today.jy, today.jm));
  const [reportType, setReportType] = useState<"expense" | "income">("expense");
  const [categorySearch, setCategorySearch] = useState("");
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [expenseReport, setExpenseReport] = useState<ReportCategory[]>([]);
  const [incomeReport, setIncomeReport] = useState<ReportCategory[]>([]);

  const { startDate, endDate } = useMemo(() => {
    if (datePreset === "today") {
      return { startDate: today.formatted, endDate: today.formatted };
    }
    if (datePreset === "this_month") {
      return {
        startDate: buildShamsi(today.jy, today.jm, 1),
        endDate: shamsiMonthEnd(today.jy, today.jm),
      };
    }
    if (datePreset === "prev_month") {
      let pm = today.jm - 1;
      let py = today.jy;
      if (pm === 0) {
        pm = 12;
        py -= 1;
      }
      return { startDate: buildShamsi(py, pm, 1), endDate: shamsiMonthEnd(py, pm) };
    }
    if (datePreset === "this_year") {
      return { startDate: buildShamsi(today.jy, 1, 1), endDate: shamsiMonthEnd(today.jy, 12) };
    }
    if (datePreset === "custom") {
      return { startDate: customStart, endDate: customEnd };
    }
    return { startDate: "", endDate: "" };
  }, [datePreset, customStart, customEnd, today.jy, today.jm, today.formatted]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const params = new URLSearchParams();
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        const res = await fetch(`/api/reports?${params.toString()}`);
        const data = await res.json();
        if (!cancelled && res.ok) {
          setSummary(data.summary);
          setExpenseReport(data.expenseReport || []);
          setIncomeReport(data.incomeReport || []);
        }
      } catch (err) {
        console.error(err);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, refreshKey]);

  const toggleExpand = (id: string) => {
    setExpandedParents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const currentCategories = reportType === "expense" ? expenseReport : incomeReport;
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return currentCategories;
    const q = categorySearch.toLowerCase().trim();
    return currentCategories.filter(
      (cat) =>
        cat.name.toLowerCase().includes(q) ||
        cat.subcategories.some((s) => s.name.toLowerCase().includes(q))
    );
  }, [currentCategories, categorySearch]);

  const presets = [
    { key: "this_month", label: "این ماه" },
    { key: "prev_month", label: "ماه قبل" },
    { key: "today", label: "امروز" },
    { key: "this_year", label: "امسال" },
    { key: "all", label: "کل دوره‌ها" },
    { key: "custom", label: "بازه دلخواه" },
  ];

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("format", "csv");
    window.location.href = `/api/reports?${params.toString()}`;
  };

  const handlePrintPdf = () => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("format", "print");
    window.open(`/api/reports?${params.toString()}`, "_blank");
  };

  return (
    <div className="space-y-4 pb-6 animate-in fade-in duration-150">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-800">گزارشات مالی</h2>
          <p className="text-[11px] text-slate-400">
            تحلیل سرفصل‌ها و زیرمجموعه‌ها بر اساس تاریخ شمسی (مبالغ به ریال)
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            title="خروجی اکسل گزارش تحلیلی این بازه"
          >
            <ExcelIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">خروجی</span> اکسل
          </button>
          <button
            type="button"
            onClick={handlePrintPdf}
            className="px-2.5 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            title="چاپ یا ذخیره به عنوان PDF گزارش تحلیلی"
          >
            <PdfIcon className="w-3.5 h-3.5 shrink-0" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* فیلتر تاریخ */}
      <div className="ios-card p-3.5 space-y-3">
        <div className="text-xs font-bold text-slate-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-sky-600" />
            <span>بازه زمانی گزارش</span>
          </div>
          {startDate && (
            <span className="text-[10px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200 shrink-0 font-bold">
              {toPersianDigits(startDate)} تا {toPersianDigits(endDate)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-xs font-medium">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setDatePreset(p.key)}
              className={`py-1.5 px-2 rounded-xl transition text-center ${
                datePreset === p.key
                  ? "bg-sky-600 text-white shadow-sm"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {datePreset === "custom" && (
          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <ShamsiDatePicker
              label="از تاریخ"
              value={customStart}
              onChange={setCustomStart}
              showTodayButton={false}
            />
            <ShamsiDatePicker
              label="تا تاریخ"
              value={customEnd}
              onChange={setCustomEnd}
              showTodayButton={false}
            />
          </div>
        )}
      </div>

      {/* شاخص‌ها */}
      {summary && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="ios-card p-3 bg-gradient-to-br from-rose-50 to-white border-rose-100">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 mb-1">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>مجموع هزینه‌ها</span>
            </div>
            <div className="text-base font-extrabold text-rose-700 dir-ltr text-right">
              {formatMoney(summary.periodExpense)}
            </div>
            <div className="text-[9px] text-slate-400 text-right">ریال</div>
          </div>

          <div className="ios-card p-3 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>مجموع درآمدها</span>
            </div>
            <div className="text-base font-extrabold text-emerald-700 dir-ltr text-right">
              {formatMoney(summary.periodIncome)}
            </div>
            <div className="text-[9px] text-slate-400 text-right">ریال</div>
          </div>

          <div className="col-span-2 ios-card p-3 bg-gradient-to-br from-sky-50 to-white border-sky-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-800">
                <PieChart className="w-3.5 h-3.5 text-sky-600" />
                <span>تراز خالص دوره (درآمد منهای هزینه)</span>
              </div>
              <div
                className={`text-base font-extrabold dir-ltr ${
                  summary.netPeriodSavings >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatMoney(Math.abs(summary.netPeriodSavings))}
              </div>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {summary.netPeriodSavings >= 0 ? "مازاد (پس‌انداز)" : "کسری"} • {summary.txCount} تراکنش
              در این بازه
            </div>
          </div>
        </div>
      )}

      {/* انتخاب نوع گزارش */}
      <div className="grid grid-cols-2 gap-2 bg-slate-200/70 p-1 rounded-2xl text-xs font-bold">
        <button
          type="button"
          onClick={() => setReportType("expense")}
          className={`py-2 rounded-xl transition ${
            reportType === "expense" ? "bg-rose-500 text-white shadow-sm" : "text-slate-600"
          }`}
        >
          سرفصل‌های هزینه
        </button>
        <button
          type="button"
          onClick={() => setReportType("income")}
          className={`py-2 rounded-xl transition ${
            reportType === "income" ? "bg-emerald-500 text-white shadow-sm" : "text-slate-600"
          }`}
        >
          سرفصل‌های درآمد
        </button>
      </div>

      {/* جستجو در گزارش */}
      <div className="relative">
        <input
          type="text"
          value={categorySearch}
          onChange={(e) => setCategorySearch(e.target.value)}
          placeholder="جستجو در سرفصل‌ها و زیرمجموعه‌ها…"
            onKeyDown={blurOnEnter}
            enterKeyHint="search"
          className="w-full pr-9 pl-4 py-2 text-xs bg-white border border-sky-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm"
        />
        <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
      </div>

      {/* لیست سرفصل‌ها */}
      <div className="space-y-2">
        {filteredCategories.length === 0 ? (
          <div className="p-8 rounded-3xl bg-white border border-sky-100 text-center text-xs text-slate-400">
            در این بازه زمانی گردشی برای سرفصل‌ها ثبت نشده است.
          </div>
        ) : (
          filteredCategories.map((parent) => {
            const isExpanded = expandedParents[parent.id] ?? true;
            const percent = parseFloat(parent.percentage) || 0;

            return (
              <div key={parent.id} className="ios-card overflow-hidden">
                <div
                  onClick={() => toggleExpand(parent.id)}
                  className="p-3.5 bg-slate-50/70 hover:bg-sky-50/50 cursor-pointer transition flex items-center justify-between gap-2 border-b border-slate-100"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-xs ${
                        reportType === "expense" ? "bg-rose-500" : "bg-emerald-500"
                      }`}
                    >
                      {reportType === "expense" ? "هـ" : "د"}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold text-slate-800 truncate">{parent.name}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {parent.subcategories.length} زیرمجموعه • {parent.percentage}٪ از کل
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="text-left">
                      <div className="text-xs font-extrabold text-slate-900 dir-ltr">
                        {formatMoney(parent.total)}
                      </div>
                      <div className="text-[9px] text-slate-400">ریال</div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFilterTransactionsByAccount(parent.id);
                      }}
                      className="p-1.5 text-sky-600 hover:bg-sky-100 rounded-lg transition"
                      title="مشاهده تراکنش‌های این سرفصل"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>

                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                <div className="w-full bg-slate-100 h-1.5">
                  <div
                    className={`h-1.5 transition-all duration-500 ${
                      reportType === "expense" ? "bg-rose-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(1, percent))}%` }}
                  />
                </div>

                {isExpanded && (
                  <div className="p-3 bg-white space-y-2 divide-y divide-slate-100">
                    {parent.subcategories.length === 0 ? (
                      <div className="text-[11px] text-slate-400 py-1">
                        زیرمجموعه‌ای برای این سرفصل تعریف نشده است.
                      </div>
                    ) : (
                      parent.subcategories.map((sub) => {
                        const subPercent =
                          parent.total > 0 ? ((sub.total / parent.total) * 100).toFixed(0) : "0";
                        return (
                          <div
                            key={sub.id}
                            className="pt-2 first:pt-0 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                              <span className="text-slate-700 font-medium truncate">{sub.name}</span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-slate-400">({subPercent}٪)</span>
                              <span className="font-bold text-slate-800 dir-ltr">
                                {formatMoney(sub.total)}
                              </span>
                              <button
                                type="button"
                                onClick={() => onFilterTransactionsByAccount(sub.id)}
                                className="text-sky-600 hover:text-sky-800 p-0.5"
                                title="ریز تراکنش‌ها"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
