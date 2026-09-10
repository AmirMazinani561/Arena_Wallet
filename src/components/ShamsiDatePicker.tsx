"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  PERSIAN_MONTH_NAMES,
  getCurrentShamsi,
  getShamsiMonthLength,
  parseShamsi,
  buildShamsi,
  toPersianDigits,
  shamsiToGregorian,
} from "@/lib/date-utils";
import { useLockBodyScroll } from "@/lib/use-lock-body-scroll";
import { useModalViewportStyle } from "@/lib/use-visual-viewport";
import { Calendar, ChevronRight, ChevronLeft, X, Check } from "lucide-react";

interface Props {
  value: string; // "1403/07/12"
  onChange: (newValue: string) => void;
  label?: string;
  compact?: boolean;
  showTodayButton?: boolean;
}

const WEEK_DAYS = [
  { short: "ش", name: "شنبه" },
  { short: "ی", name: "یکشنبه" },
  { short: "د", name: "دوشنبه" },
  { short: "س", name: "سه‌شنبه" },
  { short: "چ", name: "چهارشنبه" },
  { short: "پ", name: "پنجشنبه" },
  { short: "ج", name: "جمعه" },
];

/**
 * انتخابگر تاریخ شمسی با تقویم کامل ماهانه تعاملی.
 * روی سلول تاریخ ضربه زده می‌شود و تقویم کامل شمسی باز می‌شود
 * که در آن روز، ماه و سال به آسانی قابل انتخاب است.
 */
export function ShamsiDatePicker({
  value,
  onChange,
  label,
  compact = false,
  showTodayButton = true,
}: Props) {
  const today = getCurrentShamsi();
  const parsed = parseShamsi(value) || { jy: today.jy, jm: today.jm, jd: today.jd };

  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed.jy);
  const [viewMonth, setViewMonth] = useState(parsed.jm);
  const [selectedDay, setSelectedDay] = useState(parsed.jd);

  useLockBodyScroll(isOpen);
  const viewportStyle = useModalViewportStyle(isOpen);

  // هماهنگ‌سازی وضعیت تقویم هنگام تغییر مقدار از بیرون یا باز شدن
  useEffect(() => {
    const p = parseShamsi(value) || { jy: today.jy, jm: today.jm, jd: today.jd };
    setViewYear(p.jy);
    setViewMonth(p.jm);
    setSelectedDay(p.jd);
  }, [value, isOpen, today.jy, today.jm, today.jd]);

  // فهرست سال‌ها برای پرش سریع (از ۷ سال قبل تا ۲ سال بعد)
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = today.jy + 2; y >= today.jy - 7; y--) list.push(y);
    return list;
  }, [today.jy]);

  // محاسبه خانه‌های تقویم ماه انتخابی
  const { monthLength, startWeekday, daysGrid } = useMemo(() => {
    const len = getShamsiMonthLength(viewYear, viewMonth);
    const gDate = shamsiToGregorian(buildShamsi(viewYear, viewMonth, 1));
    const startWd = (gDate.getUTCDay() + 1) % 7; // شنبه = 0 تا جمعه = 6

    const emptyLeading: number[] = Array.from({ length: startWd }, (_, i) => i);
    const days: number[] = Array.from({ length: len }, (_, i) => i + 1);

    return {
      monthLength: len,
      startWeekday: startWd,
      daysGrid: { emptyLeading, days },
    };
  }, [viewYear, viewMonth]);

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    setSelectedDay(day);
    const newStr = buildShamsi(viewYear, viewMonth, day);
    onChange(newStr);
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    onChange(today.formatted);
    setViewYear(today.jy);
    setViewMonth(today.jm);
    setSelectedDay(today.jd);
    setIsOpen(false);
  };

  // متن تاریخ برای نمایش روی دکمه — فقط یک تاریخ خوانا و کامل فارسی
  const displayMonthName = PERSIAN_MONTH_NAMES[parsed.jm - 1] || "";
  const displayFormatted = `${toPersianDigits(parsed.jd)} ${displayMonthName} ${toPersianDigits(parsed.jy)}`;
  const isToday = parsed.jy === today.jy && parsed.jm === today.jm && parsed.jd === today.jd;

  return (
    <div className={compact ? "" : "space-y-1"}>
      {label && <label className="text-xs font-semibold text-slate-600 mb-1 block">{label}</label>}

      {/* سلول نمایش تاریخ — یک تاریخ، کاملاً وسط‌چین */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex-1 relative py-2.5 px-10 bg-slate-50 hover:bg-sky-50/70 border border-slate-200 hover:border-sky-300 rounded-xl transition active:scale-[0.99] group"
          title="باز کردن تقویم شمسی"
        >
          <Calendar className="w-4 h-4 text-sky-600 absolute right-3 top-1/2 -translate-y-1/2 group-hover:scale-110 transition-transform" />
          <span className="block text-xs font-bold text-slate-800 text-center">
            {displayFormatted}
          </span>
        </button>

        {showTodayButton && !isToday && (
          <button
            type="button"
            onClick={() => onChange(today.formatted)}
            className="px-3 py-2.5 text-[11px] font-bold bg-sky-100 hover:bg-sky-200 text-sky-800 rounded-xl transition shrink-0"
          >
            امروز
          </button>
        )}
      </div>

      {/* مودال تقویم کامل ماهانه شمسی */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setIsOpen(false);
            }}
          />
          <div style={viewportStyle} className="z-[71] flex items-center justify-center pointer-events-none p-3">
            <div
              className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-sky-100 flex flex-col pointer-events-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* هدر تقویم */}
              <div className="bg-gradient-to-r from-sky-600 to-sky-500 text-white p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-sky-100">تقویم شمسی</span>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 transition"
                    aria-label="بستن تقویم"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-center font-extrabold text-base">
                  {toPersianDigits(selectedDay)} {PERSIAN_MONTH_NAMES[viewMonth - 1]} {toPersianDigits(viewYear)}
                </div>
              </div>

              {/* ناوبری ماه و سال با دکمه و انتخابگر */}
              <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-1.5 bg-slate-50/60">
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white hover:text-sky-600 rounded-xl transition border border-transparent hover:border-slate-200"
                  aria-label="ماه بعد"
                  title="ماه بعد"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-1.5 flex-1 justify-center">
                  {/* انتخاب ماه */}
                  <select
                    value={viewMonth}
                    onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                    className="px-2 py-1 text-xs font-bold text-sky-900 bg-white border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-center appearance-none cursor-pointer"
                  >
                    {PERSIAN_MONTH_NAMES.map((m, idx) => (
                      <option key={m} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>

                  {/* انتخاب سال */}
                  <select
                    value={viewYear}
                    onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                    className="px-2 py-1 text-xs font-bold text-sky-900 bg-white border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-center appearance-none cursor-pointer dir-ltr"
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {toPersianDigits(y)}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white hover:text-sky-600 rounded-xl transition border border-transparent hover:border-slate-200"
                  aria-label="ماه قبل"
                  title="ماه قبل"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>

              {/* سرستون‌های روزهای هفته (ش تا ج) */}
              <div className="grid grid-cols-7 text-center pt-3 pb-1 px-3 text-[11px] font-bold border-b border-slate-100">
                {WEEK_DAYS.map((w, idx) => (
                  <div
                    key={w.short}
                    className={`py-1 ${idx === 6 ? "text-rose-500" : "text-slate-400"}`}
                    title={w.name}
                  >
                    {w.short}
                  </div>
                ))}
              </div>

              {/* شبکه‌ی روزهای ماه */}
              <div className="p-3 grid grid-cols-7 gap-1 text-center">
                {/* روزهای خالی پیش از روز اول ماه */}
                {daysGrid.emptyLeading.map((i) => (
                  <div key={`empty-${i}`} className="w-full aspect-square" />
                ))}

                {/* روزهای ۱ تا ماه */}
                {daysGrid.days.map((d) => {
                  const isCurrentSelected =
                    viewYear === parsed.jy && viewMonth === parsed.jm && d === parsed.jd;
                  const isToday =
                    viewYear === today.jy && viewMonth === today.jm && d === today.jd;
                  const isFriday = (startWeekday + (d - 1)) % 7 === 6;

                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleSelectDay(d)}
                      className={`w-full aspect-square flex items-center justify-center rounded-xl text-xs font-bold transition-all relative ${
                        isCurrentSelected
                          ? "bg-sky-600 text-white shadow-md shadow-sky-300 scale-105"
                          : isToday
                          ? "bg-sky-50 text-sky-800 border-2 border-sky-400"
                          : isFriday
                          ? "text-rose-600 hover:bg-rose-50"
                          : "text-slate-700 hover:bg-sky-50"
                      }`}
                    >
                      <span>{toPersianDigits(d)}</span>
                      {isToday && !isCurrentSelected && (
                        <span className="w-1 h-1 rounded-full bg-sky-600 absolute bottom-1" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* نوار پایینی: امروز و تأیید */}
              <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleSelectToday}
                  className="py-2 px-3 text-xs font-semibold text-sky-700 bg-white hover:bg-sky-100 border border-sky-200 rounded-xl transition"
                >
                  برو به امروز
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="py-2 px-3 text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newStr = buildShamsi(viewYear, viewMonth, selectedDay);
                      onChange(newStr);
                      setIsOpen(false);
                    }}
                    className="py-2 px-4 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-xl shadow-sm transition flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>تأیید</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
