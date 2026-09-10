"use client";

import React, { useState } from "react";
import { useLockBodyScroll } from "@/lib/use-lock-body-scroll";
import { MoreVertical, Star, ExternalLink, Edit2, Trash2, Plus, X } from "lucide-react";

export interface RowAction {
  key: string;
  label: string;
  icon: "star" | "ledger" | "edit" | "delete" | "add";
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}

const ICONS = {
  star: Star,
  ledger: ExternalLink,
  edit: Edit2,
  delete: Trash2,
  add: Plus,
};

interface Props {
  actions: RowAction[];
  title?: string;
  subtitle?: string;
}

/**
 * منوی سه نقطه (⋯) به صورت برگه عملیات از پایین (ActionSheet).
 * از لایه‌بندی صفحه و کارت‌های overflow-hidden کاملاً مستقل است
 * و هرگز زیر صفحه یا پشت کارت‌ها پنهان نمی‌شود.
 */
export function RowActionsMenu({ actions, title, subtitle }: Props) {
  const [open, setOpen] = useState(false);
  useLockBodyScroll(open);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-sky-600 hover:bg-sky-50 active:scale-95 transition"
        aria-label="عملیات حساب"
        title="عملیات"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border border-sky-100 animate-in fade-in zoom-in-95 duration-150 max-h-[80dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* عنوان */}
            {(title || subtitle) && (
              <div className="shrink-0 p-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-2 bg-slate-50/70">
                <div className="min-w-0">
                  {title && <div className="text-sm font-bold text-slate-800 truncate">{title}</div>}
                  {subtitle && <div className="text-[11px] text-slate-400 mt-0.5">{subtitle}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 transition shrink-0"
                  aria-label="بستن"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* گزینه‌ها */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 divide-y divide-slate-100">
              {actions.map((a) => {
                const Icon = ICONS[a.icon];
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      a.onClick();
                    }}
                    className={`w-full text-right p-3 hover:bg-sky-50/70 rounded-2xl transition flex items-center gap-3 active:scale-[0.99] ${
                      a.danger
                        ? "text-rose-600 hover:bg-rose-50"
                        : a.active
                        ? "text-amber-600 hover:bg-amber-50"
                        : "text-slate-800"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        a.danger
                          ? "bg-rose-50 text-rose-600"
                          : a.active
                          ? "bg-amber-50 text-amber-600"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Icon className="w-4 h-4" fill={a.icon === "star" && a.active ? "currentColor" : "none"} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold">{a.label}</div>
                    </div>
                    <span className="text-slate-300 text-xs">❮</span>
                  </button>
                );
              })}
            </div>

            {/* دکمه انصراف */}
            <div className="shrink-0 p-3 pt-2 border-t border-slate-100 bg-white">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
