"use client";

import React, { useState, useEffect } from "react";
import {
  MessageSquarePlus,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Building2,
} from "lucide-react";
import { Account } from "@/types";

interface PatternItem {
  id: string;
  accountId: string;
  accountName?: string;
  kind: "deposit" | "withdrawal";
  sampleText: string;
  bankName: string | null;
  cardLast4: string | null;
  createdAt: string;
}

interface Props {
  accounts: Account[];
}

export function SmsPatternTrainer({ accounts }: Props) {
  const [sampleText, setSampleText] = useState("");
  const [accountId, setAccountId] = useState("");
  const [kind, setKind] = useState<"deposit" | "withdrawal">("withdrawal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [patterns, setPatterns] = useState<PatternItem[]>([]);
  const [showPatternsList, setShowPatternsList] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const bankAccounts = accounts.filter(
    (a) => a.type === "bank" || a.type === "cash"
  );

  const loadPatterns = async () => {
    try {
      const res = await fetch("/api/sms-patterns");
      if (res.ok) {
        const data = await res.json();
        if (data.patterns) setPatterns(data.patterns);
      }
    } catch {
      // نادیده گرفتن خطا در لود اولیه
    }
  };

  useEffect(() => {
    loadPatterns();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const text = sampleText.trim();
    if (!text) {
      setError("لطفاً متن نمونه پیامک را وارد کنید.");
      return;
    }
    if (!accountId) {
      setError("لطفاً حساب بانکی متناظر را انتخاب نمایید.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/sms-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          kind,
          sampleText: text,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "خطا در ثبت الگو");
      }

      // بلافاصله فرم پاک می‌شود تا صفحه شلوغ نشود
      setSampleText("");
      setAccountId("");
      setKind("withdrawal");
      setSuccess("✅ الگوی پیامک با موفقیت ذخیره شد و فرم برای ثبت نمونه بعدی پاکسازی گردید.");
      loadPatterns();

      setTimeout(() => {
        setSuccess(null);
      }, 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در برقراری ارتباط با سرور";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("آیا از حذف این الگوی پیامک اطمینان دارید؟")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/sms-patterns?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPatterns((prev) => prev.filter((p) => p.id !== id));
      } else {
        const data = await res.json();
        alert(data.error || "خطا در حذف الگو");
      }
    } catch {
      alert("خطا در ارتباط با سرور");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="ios-card p-4 space-y-4 border border-sky-100 bg-white">
      {/* عنوان بخش */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
            <MessageSquarePlus className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800">آموزش الگوی پیامک بانکی</h3>
            <p className="text-[10px] text-slate-400">
              ثبت نمونه پیامک جهت شناسایی هوشمند بانک و تشخیص خودکار واریز یا برداشت
            </p>
          </div>
        </div>
        <span className="text-[10px] bg-sky-50 text-sky-700 border border-sky-200/60 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-sky-600" />
          هوشمند
        </span>
      </div>

      {/* پیام موفقیت */}
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* پیام خطا */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200/80 rounded-xl text-xs text-rose-800 flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* فرم ثبت الگو */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* کادر ورود متن نمونه پیامک */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            متن نمونه پیامک بانکی:
          </label>
          <textarea
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            rows={3}
            placeholder="یک پیامک واریز یا برداشت از بانک خود را اینجا الصاق کنید..."
            className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition resize-none leading-relaxed text-slate-800"
          />
        </div>

        {/* انتخاب حساب بانکی و نوع واریز/برداشت */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* حساب متناظر */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              متعلق به کدام حساب بانکی است؟
            </label>
            <div className="relative">
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full text-xs py-2 px-3 pl-8 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition appearance-none text-slate-800 font-medium"
              >
                <option value="">-- انتخاب حساب بانکی / صندوق --</option>
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} {acc.detailInfo ? `(${acc.detailInfo})` : ""}
                  </option>
                ))}
              </select>
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* نوع تراکنش */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              این نمونه نشان‌دهنده کدام است؟
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setKind("withdrawal")}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  kind === "withdrawal"
                    ? "bg-rose-500 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>برداشت (هزینه)</span>
              </button>
              <button
                type="button"
                onClick={() => setKind("deposit")}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  kind === "deposit"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>واریز (درآمد)</span>
              </button>
            </div>
          </div>
        </div>

        {/* دکمه ثبت */}
        <div className="pt-1">
          <button
            type="submit"
            disabled={loading || !sampleText.trim() || !accountId}
            className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:pointer-events-none text-white font-bold text-xs rounded-xl shadow-md shadow-sky-600/20 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>در حال پردازش و ثبت الگو...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>ثبت الگو و پاکسازی فرم</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* بخش آکاردئونی الگوهای فعال (کاملاً جمع‌وجور برای جلوگیری از شلوغی) */}
      <div className="border-t border-slate-100 pt-2.5">
        <button
          type="button"
          onClick={() => setShowPatternsList(!showPatternsList)}
          className="w-full py-1.5 px-2 flex items-center justify-between text-slate-500 hover:text-slate-800 transition text-[11px] font-semibold"
        >
          <span className="flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-sky-600" />
            <span>الگوهای ذخیره‌شده</span>
            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-full text-[10px]">
              {patterns.length}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[10px] text-sky-600">
            {showPatternsList ? "بستن لیست" : "مشاهده"}
            {showPatternsList ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </span>
        </button>

        {showPatternsList && (
          <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1 animate-in fade-in duration-150">
            {patterns.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-3 bg-slate-50 rounded-xl">
                هنوز هیچ الگوی پیامکی ثبت نشده است. با ثبت نمونه در کادر بالا، سیستم با پیامک‌های بانک شما هماهنگ می‌شود.
              </p>
            ) : (
              patterns.map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 bg-slate-50/80 border border-slate-200/70 rounded-xl flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-sky-600" />
                        {p.accountName || "حساب"}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          p.kind === "deposit"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {p.kind === "deposit" ? "واریز" : "برداشت"}
                      </span>
                      {p.cardLast4 && (
                        <span className="text-[10px] font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                          کارت: {p.cardLast4}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 truncate" title={p.sampleText}>
                      «{p.sampleText}»
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    disabled={deletingId === p.id}
                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition shrink-0"
                    title="حذف الگو"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
