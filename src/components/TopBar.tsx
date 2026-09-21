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
      className="shrink-0 z-30 bg-white/90 backdrop-blur-xl"
      style={{
        paddingTop: "max(12px, env(safe-area-inset-top, 12px))",
        boxShadow: "0 1px 20px -2px rgba(2, 132, 199, 0.08), 0 1px 4px -1px rgba(0,0,0,0.03)",
      }}
    >
      <div className="px-4 h-14 flex items-center justify-between">
        {/* لوگو و عنوان */}
        <div className="flex items-center gap-2.5">
          <WalletLogo className="w-8 h-8" size={32} />
          <div className="flex flex-col leading-none">
            <span className="text-sm font-extrabold text-sky-950 tracking-tight">کیف پول هوشمند</span>
            <span className="text-[10px] text-slate-400 font-medium">Arena Wallet</span>
          </div>
        </div>

        {/* دکمه‌های راست */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSearch}
            className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-2xl transition"
            title="جستجوی جامع"
            aria-label="جستجو"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>

          <button
            type="button"
            onClick={onLockApp}
            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-2xl transition"
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
