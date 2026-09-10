"use client";

import React from "react";
import { Home, Plus, PieChart, Layers, Settings } from "lucide-react";

interface Props {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenNewTx: () => void;
}

const TABS = [
  { key: "home", label: "خانه", Icon: Home },
  { key: "reports", label: "گزارشات", Icon: PieChart },
  { key: "plus", label: "", Icon: Plus },
  { key: "accounts", label: "حساب‌ها", Icon: Layers },
  { key: "settings", label: "تنظیمات", Icon: Settings },
] as const;

/**
 * نوار پایین — همه آیتم‌ها هم‌اندازه و هم‌تراز.
 * دکمه ثبت فقط آیکون + است و با بقیه در یک خط قرار دارد.
 */
export function BottomTabBar({ currentTab, onTabChange, onOpenNewTx }: Props) {
  return (
    <nav
      className="shrink-0 z-40 bg-white/95 backdrop-blur-xl border-t border-sky-100/90"
      style={{
        paddingBottom: "max(6px, env(safe-area-inset-bottom, 6px))",
      }}
      aria-label="ناوبری اصلی"
    >
      <div className="h-14 max-w-md mx-auto grid grid-cols-5 items-center px-1">
        {TABS.map((t) => {
          if (t.key === "plus") {
            return (
              <button
                key="plus"
                type="button"
                onClick={onOpenNewTx}
                className="h-full flex flex-col items-center justify-center active:scale-95"
                title="ثبت تراکنش"
                aria-label="ثبت تراکنش"
              >
                <span className="w-9 h-9 rounded-full bg-sky-600 text-white flex items-center justify-center shadow-sm shadow-sky-500/30">
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                </span>
              </button>
            );
          }

          const active = currentTab === t.key;
          const Icon = t.Icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTabChange(t.key)}
              className={`h-full flex flex-col items-center justify-center gap-0.5 transition-colors active:scale-95 ${
                active ? "text-sky-600" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : ""}`} />
              <span className={`text-[10px] leading-none ${active ? "font-bold text-sky-700" : "font-medium"}`}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
