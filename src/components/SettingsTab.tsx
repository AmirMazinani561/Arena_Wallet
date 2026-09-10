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
} from "lucide-react";
import { BackupModal } from "./BackupModal";
import { LoginModal } from "./LoginModal";
import { APP_VERSION } from "@/lib/version";
import { SnapshotsPanel } from "./SnapshotsPanel";

interface Props {
  user: { id: string; username: string; fullName?: string | null } | null;
  onLogout: () => void;
  onRefreshAllData: () => void;
}

export function SettingsTab({ user, onLogout, onRefreshAllData }: Props) {
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);
  const [showAccountingHelp, setShowAccountingHelp] = useState(false);

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
      <div className="ios-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-lg shadow-sm">
            {user?.username ? user.username.charAt(0).toUpperCase() : "U"}
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800">
              {user?.fullName || "مدیر سیستم"}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              نام کاربری: <span className="font-mono text-sky-700">{user?.username}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition flex items-center gap-1.5 text-xs font-semibold"
          title="خروج از حساب"
        >
          <LogOut className="w-4 h-4" />
          <span>خروج</span>
        </button>
      </div>

      {/* Backup and Security Actions */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-700 px-1">امنیت و نسخه پشتیبان</h3>

        <div className="ios-card divide-y divide-slate-100 overflow-hidden">
          {/* Backup & Restore */}
          <button
            type="button"
            onClick={() => setIsBackupOpen(true)}
            className="w-full p-3.5 text-right hover:bg-sky-50/50 transition flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">
                  پشتیبان‌گیری و بازگردانی (Backup & Restore)
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  دانلود کامل پایگاه‌داده به عنوان JSON یا بازگردانی داده‌های قبلی
                </div>
              </div>
            </div>
            <span className="text-xs font-semibold text-sky-600">اقدام ❯</span>
          </button>

          {/* Change Password */}
          <button
            type="button"
            onClick={() => setIsChangePassOpen(true)}
            className="w-full p-3.5 text-right hover:bg-sky-50/50 transition flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">تغییر رمز عبور ورود</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  تعویض کلمه عبور محافظ برنامه برای امنیت بیشتر
                </div>
              </div>
            </div>
            <span className="text-xs font-semibold text-sky-600">تغییر ❯</span>
          </button>
        </div>
      </div>

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
