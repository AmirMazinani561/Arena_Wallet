"use client";

import React from "react";
import { Search, Lock } from "lucide-react";
import { WalletLogo } from "./WalletLogo";

interface Props {
  onOpenSearch: () => void;
  onLockApp: () => void;
}

export function TopBar({ onOpenSearch, onLockApp }: Props) {
  return (
    <header
      className="shrink-0 z-30 bg-white/95 backdrop-blur-md border-b border-sky-100"
      style={{
        paddingTop: "max(12px, env(safe-area-inset-top, 12px))",
      }}
    >
      <div className="px-4 h-12 flex items-center justify-between">
        {/* لوگوی وکتور درون‌برنامه‌ای و عنوان — هم‌تراز عمودی و بدون وابستگی به شبکه */}
        <div className="flex items-center gap-2.5">
          <WalletLogo className="w-8 h-8" size={32} />
          <span className="text-sm font-extrabold text-sky-950 leading-none">
            کیف پول هوشمند
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenSearch}
            className="w-9 h-9 flex items-center justify-center text-slate-600 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition"
            title="جستجوی جامع"
            aria-label="جستجو"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>

          <button
            type="button"
            onClick={onLockApp}
            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
            title="قفل کردن نرم‌افزار"
            aria-label="قفل"
          >
            <Lock className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </header>
  );
}
