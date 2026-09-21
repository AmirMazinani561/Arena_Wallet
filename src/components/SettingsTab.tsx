"use client";

import React, { useState } from "react";
import {
  Download,
  Lock,
  KeyRound,
  ShieldCheck,
  Smartphone,
  Info,
  LogOut,
  Sparkles,
  HelpCircle,
  MessageSquareText,
  RefreshCw,
  Loader2,
  ChevronLeft,
} from "lucide-react";
import { BackupModal } from "./BackupModal";
import { LoginModal } from "./LoginModal";
import { APP_VERSION } from "@/lib/version";
import { SnapshotsPanel } from "./SnapshotsPanel";
import { SmsPatternTrainer } from "./SmsPatternTrainer";
import { Account } from "@/types";

interface Props {
  user: { id: string; username: string; fullName?: string | null } | null;
  onLogout: () => void;
  onRefreshAllData: () => void;
  accounts?: Account[];
}

export function SettingsTab({ user, onLogout, onRefreshAllData, accounts = [] }: Props) {
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);
  const [showAccountingHelp, setShowAccountingHelp] = useState(false);
  const [isSyncingEquity, setIsSyncingEquity] = useState(false);

  const handleSyncEquityAll = async () => {
    if (isSyncingEquity) return;
    setIsSyncingEquity(true);
    try {
      const res = await fetch("/api/equity/sync-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "خطا در برقراری ارتباط با سرور");
        return;
      }
      alert(data.message || "همگام‌سازی با موفقیت انجام شد.");
      onRefreshAllData();
    } catch {
      alert("خطای ارتباط با سرور");
    } finally {
      setIsSyncingEquity(false);
    }
  };

  return (
    <div className="space-y-4 pb-6 animate-in fade-in duration-150">
      {/* Title */}
      <div>
        <h2 className="text-base font-bold text-slate-800">تنظیمات و امنیت نرم‌افزار</h2>
        <p className="text-[11px] text-slate-400">
          مدیریت دسترسی، پشتیبان‌گیری ابری و راهنمای ساختار حساب‌ها
        </p>
      </div>

      {/* User profile card */}
      <div className="ios-card p-4 flex items-center justify-between border border-sky-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-base shadow-xs shrink-0">
            {user?.username ? user.username.charAt(0).toUpperCase() : "U"}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-800 truncate">
              {user?.fullName || "مدیر کیف پول"}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
              نام کاربری: <span className="font-mono text-sky-700 font-semibold">{user?.username}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="px-3 py-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-xl transition flex items-center gap-1.5 text-xs font-bold shrink-0 active:scale-95"
          title="خروج از حساب"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>خروج</span>
        </button>
      </div>

      {/* Backup and Security Actions */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-700 px-1">امنیت و نسخه پشتیبان</h3>

        <div className="ios-card divide-y divide-slate-100 overflow-hidden border border-sky-100">
          {/* Backup & Restore */}
          <button
            type="button"
            onClick={() => setIsBackupOpen(true)}
            className="w-full p-3.5 text-right hover:bg-sky-50/50 transition flex items-center justify-between gap-3 group"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <Download className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-800 truncate">
                  پشتیبان‌گیری و بازگردانی اطلاعات
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                  دانلود کامل پایگاه‌داده به عنوان JSON یا بازگردانی فایل‌های قبلی
                </div>
              </div>
            </div>
            <ChevronLeft className="w-4 h-4 text-slate-300 group-hover:text-sky-600 transition shrink-0" />
          </button>

          {/* بررسی و همگام‌سازی با نرم‌افزار سرمایه */}
          <div className="w-full p-3.5 text-right hover:bg-emerald-50/30 transition flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                {isSyncingEquity ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-800 truncate">
                  همگام‌سازی با نرم‌افزار سرمایه
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                  بررسی و انتقال خودکار تراکنش‌های شرکا (سلطانی و مزینانی)
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSyncEquityAll}
              disabled={isSyncingEquity}
              className="shrink-0 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/90 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 transition active:scale-95 disabled:opacity-60 whitespace-nowrap"
            >
              {isSyncingEquity ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>در حال بررسی…</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3" />
                  <span>همگام‌سازی</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Add from SMS */}
          <a
            href="/quick-add"
            className="w-full p-3.5 text-right hover:bg-violet-50/30 transition flex items-center justify-between gap-3 group"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                <MessageSquareText className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5 truncate">
                  <span className="truncate">ثبت سریع از پیامک</span>
                  <span className="text-[9px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5 shrink-0">
                    آزمایشی
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                  تحلیل خودکار پیامک بانکی، ثبت در انتظار و راهنمای شورتکات iOS
                </div>
              </div>
            </div>
            <ChevronLeft className="w-4 h-4 text-slate-300 group-hover:text-violet-600 transition shrink-0" />
          </a>

          {/* Change Password */}
          <button
            type="button"
            onClick={() => setIsChangePassOpen(true)}
            className="w-full p-3.5 text-right hover:bg-amber-50/30 transition flex items-center justify-between gap-3 group"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-800 truncate">
                  تغییر رمز عبور ورود
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                  تعویض کلمه عبور محافظ برنامه برای امنیت بیشتر
                </div>
              </div>
            </div>
            <ChevronLeft className="w-4 h-4 text-slate-300 group-hover:text-amber-600 transition shrink-0" />
          </button>
        </div>
      </div>

      {/* بخش آموزش هوشمند الگوی پیامک بانکی */}
      <SmsPatternTrainer accounts={accounts} />

      {/* بک‌آپ خودکار */}
      <SnapshotsPanel onRestored={onRefreshAllData} />

      {/* Accounting & Architectural Explanation Accordion */}
      <div className="ios-card p-4 space-y-3 bg-gradient-to-br from-sky-50/50 to-white border-sky-200/80">
        <div
          onClick={() => setShowAccountingHelp(!showAccountingHelp)}
          className="flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-sky-600" />
            <h4 className="text-xs font-bold text-sky-950">
              تحلیل علمی حسابداری و برنامه‌نویسی ساختار سیستم
            </h4>
          </div>
          <span className="text-xs text-sky-600 font-semibold">
            {showAccountingHelp ? "بستن ▲" : "مشاهده جزئیات ▼"}
          </span>
        </div>

        {showAccountingHelp && (
          <div className="text-xs text-slate-600 space-y-2.5 pt-2 border-t border-sky-100 leading-relaxed">
            <div className="p-2.5 rounded-xl bg-white border border-sky-100">
              <div className="font-bold text-sky-900 mb-1">
                ۱. چرا درآمد و هزینه باید دو بخش مجزا باشند؟
              </div>
              <p className="text-[11px] text-slate-600">
                از نظر اصول حسابداری دوبل و گزارشگری سود و زیان (P&L)، «هزینه» دارای ماهیت بدهکار بوده و دارایی‌ها را کاهش می‌دهد؛ در حالی که «درآمد» ماهیت بستانکار داشته و دارایی‌ها را افزایش می‌دهد. یکی کردن این دو سرفصل در یک رکورد باعث اختلال در محاسبه ترازنامه، منفی شدن مانده‌ها و ابهام در صورت‌های مالی می‌گردد. بنابراین در این نرم‌افزار، سرفصل‌های هزینه و درآمد کاملاً تفکیک شده اما با تجربه کاربری روان در دسترس هستند.
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-white border border-sky-100">
              <div className="font-bold text-sky-900 mb-1">
                ۲. ساختار درختی سرفصل‌ها و زیرمجموعه‌ها:
              </div>
              <p className="text-[11px] text-slate-600">
                هر سرفصل (مثلاً «هزینه‌های خودرو») نقش تجمیع‌کننده را دارد و هنگام گزارش‌گیری، مبالغ تمامی زیرمجموعه‌ها (بنزین، تعمیرات، طرح ترافیک و...) به صورت خودکار در گزارش سرفصل سرگروه لحاظ و محاسبه می‌شوند.
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-white border border-sky-100">
              <div className="font-bold text-sky-900 mb-1">
                ۳. هماهنگی با آیفون (iOS PWA):
              </div>
              <p className="text-[11px] text-slate-600">
                این برنامه به صورت Web App بهینه‌شده برای آیفون طراحی گردیده و امکان افزودن به صفحه اصلی آیفون (Add to Home Screen) با تم مدرن آبی آسمانی، ناچ، دکمه‌های لمسی و تقویم کاملاً شمسی را داراست.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* App info */}
      <div className="p-3 text-center text-[10px] text-slate-400 space-y-1">
        <div className="font-semibold text-slate-500">کیف پول هوشمند — نسخه {APP_VERSION}</div>
        <div>طراحی شده با Next.js، PostgreSQL و فونت استاندارد وزیرمتن</div>
      </div>

      {/* Modals */}
      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        onRestoreSuccess={onRefreshAllData}
      />

      <LoginModal
        isOpen={isChangePassOpen}
        onClose={() => setIsChangePassOpen(false)}
        isChangePasswordOnly={true}
        onLoginSuccess={() => setIsChangePassOpen(false)}
      />
    </div>
  );
}
