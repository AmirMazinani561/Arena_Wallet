"use client";

import React from "react";
import { separateThousands, parseAmount } from "@/lib/date-utils";
import { blurOnEnter } from "@/lib/use-visual-viewport";

interface Props {
  value: string; // مقدار خام رشته‌ای با جداکننده
  onChange: (formatted: string, raw: number) => void;
  placeholder?: string;
  big?: boolean;
  autoFocus?: boolean;
  center?: boolean;
}

/**
 * ورودی مبلغ ریالی با درج خودکار جداکننده هزارگان هنگام تایپ
 */
export function AmountInput({
  value,
  onChange,
  placeholder = "۰",
  big = false,
  autoFocus = false,
  center = false,
}: Props) {

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = separateThousands(e.target.value);
    onChange(formatted, parseAmount(formatted));
  };

  const inputClass = center
    ? big
      ? "w-full text-center py-3 px-4 text-2xl font-black bg-sky-50/60 border border-sky-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sky-900 dir-ltr tracking-wide"
      : "w-full text-center py-2.5 px-4 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800 dir-ltr"
    : big
      ? "w-full text-center py-3 pl-16 pr-4 text-2xl font-black bg-sky-50/60 border border-sky-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sky-900 dir-ltr tracking-wide"
      : "w-full py-2 pl-14 pr-3 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800 dir-ltr text-left";

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          onKeyDown={blurOnEnter}
          autoFocus={autoFocus}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className={inputClass}
        />
        {!center && (
          <span
            className={`absolute left-3 font-semibold text-slate-400 pointer-events-none ${
              big ? "top-1/2 -translate-y-1/2 text-sm" : "top-2 text-xs"
            }`}
          >
            ریال
          </span>
        )}
      </div>
    </div>
  );
}
