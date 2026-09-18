"use client";

import { useLockBodyScroll } from "@/lib/use-lock-body-scroll";
import React from "react";
import { X } from "lucide-react";

export interface ActionSheetItem {
  key: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  tone?: "sky" | "rose" | "emerald" | "slate";
  onClick: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  items: ActionSheetItem[];
}

/**
 * منوی انتخاب عملیات به سبک iOS Action Sheet
 */
export function ActionSheet({ isOpen, onClose, title, subtitle, items }: Props) {
  useLockBodyScroll(isOpen);
  if (!isOpen) return null;

  const toneMap: Record<string, string> = {
    sky: "bg-sky-50 text-sky-600",
    rose: "bg-rose-50 text-rose-600",
    emerald: "bg-emerald-50 text-emerald-600",
    slate: "bg-slate-100 text-slate-600",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-sky-100 mb-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* هدر */}
        <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-800 truncate">{title}</div>
            {subtitle && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-slate-100 text-slate-400 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* گزینه‌ها */}
        <div className="p-2 divide-y divide-slate-100">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                item.onClick();
              }}
              className="w-full text-right p-3 hover:bg-sky-50/70 rounded-2xl transition flex items-center gap-3 active:scale-[0.99]"
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  toneMap[item.tone || "sky"]
                }`}
              >
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-800">{item.label}</div>
                {item.description && (
                  <div className="text-[10px] text-slate-400 mt-0.5">{item.description}</div>
                )}
              </div>
              <span className="text-slate-300 text-xs">❮</span>
            </button>
          ))}
        </div>

        {/* انصراف */}
        <div className="p-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition"
          >
            انصراف
          </button>
        </div>
      </div>
    </div>
  );
}
