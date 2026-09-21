"use client";

import React from "react";
import { Home, PieChart, Plus, Layers, Settings } from "lucide-react";

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
 * نوار پایین — Floating Pill Style
 * کپسول شناور با backdrop blur و دکمه + مرکزی برجسته
 */
export function BottomTabBar({ currentTab, onTabChange, onOpenNewTx }: Props) {
  return (
    <div
      className="shrink-0 z-40 px-4 bg-transparent"
      style={{
        paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))",
      }}
    >
      <nav
        className="h-16 bg-white/92 backdrop-blur-2xl rounded-full shadow-xl shadow-sky-900/10 border border-white/70 max-w-md mx-auto grid grid-cols-5 items-center px-2"
        aria-label="ناوبری اصلی"
      >
        {TABS.map((t) => {
          if (t.key === "plus") {
            return (
              <button
                key="plus"
                type="button"
                onClick={onOpenNewTx}
                className="h-full flex flex-col items-center justify-center"
                title="ثبت تراکنش"
                aria-label="ثبت تراکنش"
              >
                <span className="w-12 h-12 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-white flex items-center justify-center shadow-lg shadow-sky-400/40 active:scale-90 transition">
                  <Plus className="w-6 h-6 stroke-[2.5]" />
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
              className="h-full flex flex-col items-center justify-center gap-0.5 transition active:scale-90"
            >
              <Icon
                className={`w-[22px] h-[22px] transition-colors ${
                  active ? "text-sky-600" : "text-slate-400"
                }`}
                strokeWidth={active ? 2.5 : 1.8}
              />
              <span className={`text-[9px] leading-none font-semibold transition-colors ${
                active ? "text-sky-600" : "text-slate-400"
              }`}>
                {t.label}
              </span>
              {/* نقطه نشانگر تب فعال */}
              <span className={`w-1 h-1 rounded-full transition-all duration-200 ${
                active ? "bg-sky-500 scale-100" : "bg-transparent scale-0"
              }`} />
            </button>
          );
        })}
      </nav>
    </div>
  );
}
