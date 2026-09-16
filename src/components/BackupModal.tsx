"use client";

import { useLockBodyScroll } from "@/lib/use-lock-body-scroll";
import React, { useState } from "react";
import { Download, Upload, X, ShieldAlert, CheckCircle2, FileSpreadsheet, Printer } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess: () => void;
}

export function BackupModal({ isOpen, onClose, onRestoreSuccess }: Props) {
  useLockBodyScroll(isOpen);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (!isOpen) return null;

  const handleDownloadBackup = async (format: "json" | "sql" | "csv" | "print" = "json") => {
    if (format === "print") {
      window.open("/api/backup?format=print", "_blank");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`/api/backup?format=${format}`);
      if (!res.ok) throw new Error("خطا در دریافت فایل");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "csv" ? "csv" : format;
      const prefix = format === "csv" ? "wallet_transactions" : "wallet_backup";
      a.download = `${prefix}_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setStatusMessage({
        type: "success",
        text:
          format === "sql"
            ? "فایل SQL دانلود شد. می‌توانید آن را در phpMyAdmin هاست اجرا کنید."
            : format === "csv"
            ? "فایل Excel (CSV) با کدگذاری استاندارد فارسی دانلود شد."
            : "فایل پشتیبان JSON با موفقیت دانلود شد.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در دانلود";
      setStatusMessage({ type: "error", text: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("هشدار: بازگردانی پشتیبان کلیه اطلاعات فعلی را با داده‌های فایل جایگزین خواهد کرد. آیا مطمئن هستید؟")) {
      e.target.value = "";
      return;
    }

    try {
      setLoading(true);
      setStatusMessage(null);
      const text = await file.text();
      const parsed = JSON.parse(text);

      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در بازگردانی");

      setStatusMessage({ type: "success", text: data.message || "اطلاعات با موفقیت بازگردانی شد." });
      setTimeout(() => {
        onRestoreSuccess();
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در فایل یا فرمت پشتیبان";
      setStatusMessage({ type: "error", text: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-sky-100 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-600 to-sky-500 text-white p-4 flex items-center justify-between">
          <span className="font-bold text-base">پشتیبان‌گیری و بازگردانی داده‌ها</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {statusMessage && (
            <div
              className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
                statusMessage.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Backup Download Section */}
          <div className="p-4 bg-sky-50/70 rounded-2xl border border-sky-200">
            <h4 className="text-xs font-bold text-sky-900 mb-1 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-sky-600" />
              <span>دانلود نسخه پشتیبان (Backup)</span>
            </h4>
            <p className="text-[11px] text-slate-500 mb-3">
              نسخه کامل حساب‌ها، سرفصل‌ها و تراکنش‌ها را دانلود کنید. فرمت JSON برای بازگردانی
              داخل خود برنامه و فرمت SQL برای بازیابی مستقیم در phpMyAdmin هاست کاربرد دارد.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleDownloadBackup("json")}
                disabled={loading}
                className="py-2.5 px-3 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>فایل JSON</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadBackup("sql")}
                disabled={loading}
                className="py-2.5 px-3 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>فایل SQL</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadBackup("csv")}
                disabled={loading}
                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>فایل Excel (CSV)</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadBackup("print")}
                disabled={loading}
                className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>چاپ / PDF</span>
              </button>
            </div>
          </div>

          {/* Restore Section */}
          <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200">
            <h4 className="text-xs font-bold text-amber-900 mb-1 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-amber-700" />
              <span>بازگردانی نسخه پشتیبان (Restore)</span>
            </h4>
            <p className="text-[11px] text-amber-800/80 mb-3">
              فایل پشتیبان ذخیره شده قبلی را انتخاب کنید تا تمامی اطلاعات به برنامه برگردد.
            </p>
            <label className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>انتخاب فایل پشتیبان JSON</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                disabled={loading}
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
