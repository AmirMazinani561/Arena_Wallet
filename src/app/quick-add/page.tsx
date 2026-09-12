"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Loader2,
  MessageSquareText,
  Percent,
  Send,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { formatMoney } from "@/lib/date-utils";

/* ---------------- انواع ---------------- */

interface IntakeResponse {
  ok: boolean;
  message: string;
  created?: boolean;
  duplicate?: boolean;
  dryRun?: boolean;
  needsAccount?: boolean;
  kind?: "deposit" | "withdrawal" | "fee" | "unknown";
  amount?: number;
  amountSign?: "+" | "-" | null;
  fee?: number;
  description?: string;
  balance?: number | null;
  shamsiDate?: string;
  hasExplicitDate?: boolean;
  tracking?: string | null;
  counterpartyHint?: string | null;
  bankHint?: string | null;
  account?: { id: string; name: string } | null;
  matchedVia?: string;
  plannedFromName?: string;
  plannedToName?: string;
  plannedStatus?: string;
  transactionId?: string;
  reason?: string | null;
}

/* ---------------- پیامک‌های نمونه برای تست ---------------- */

const SAMPLES: { label: string; text: string }[] = [
  {
    label: "برداشت بلو",
    text: "برداشت کارت 6219-86**-****-9023; مبلغ:4,500,000ريال; مانده:12,345,678ريال; تاريخ:1404/06/20-14:32; شناسه رسيد:123456789012",
  },
  {
    label: "خرید با کارت ملت",
    text: "خرید با كارت بانك ملت؛ مبلغ 1,250,000 ريال؛ تاريخ 1404/06/20 ساعت 14:32؛ مانده حساب 56,789,012 ريال؛ شماره مرجع 123456789012",
  },
  {
    label: "واریز به کارت",
    text: "واریز به کارت 6219-86**-****-9023; مبلغ:2,000,000ريال; از طرف: علي رضايي; مانده:14,345,678ريال; تاريخ:1404/06/21-09:15",
  },
  {
    label: "انتقال + کارمزد",
    text: "انتقال وجه از حساب ۴۷۸۸-۹۰۱-۱۲ به حساب ۶۱۰۴-۳۷۸۵-۹۹۹۹-۱۰۱۰; مبلغ:30,000,000ريال; کارمزد:25,000ريال; مانده:550,000,000ريال; تاريخ:1404/06/21-16:05",
  },
  {
    label: "پیامک کارمزد",
    text: "كارمزد انتقال وجه از حساب ۴۷۸۸-۹۰۱-۱۲ مبلغ 25,000 ريال; تاريخ:1404/06/21-16:06",
  },
  {
    label: "برداشت خودپرداز",
    text: "برداشت نقدی از خودپرداز; کارت 6219-86**-****-9023; مبلغ 3,000,000 ريال; ساعت 21:45",
  },
  {
    label: "نشست (واریز)",
    text: "مبلغ 5,000,000 ریال به حساب ۴۷۸۸-۹۰۱-۱۲ نشست; مانده:555,000,000ريال; تاريخ:1404-06-22-10:20",
  },
  {
    label: "پرید (برداشت)",
    text: "مبلغ 1,200,000 ریال از کارت 6219-86**-****-9023 پرید; مانده:11,145,678ريال; تاريخ:1404-06-22-11:05",
  },
  {
    label: "علامت − (برداشت)",
    text: "کارت 6219-86**-****-9023; مبلغ:-750,000ريال; تاريخ:1404-06-22-12:00",
  },
  {
    label: "علامت + (واریز)",
    text: "حساب ۴۷۸۸-۹۰۱-۱۲; مبلغ:+9,000,000ريال; تاريخ:1404-06-22-12:30",
  },
  {
    label: "تجارت (واقعی)",
    text: "*بانک تجارت*\nحساب: 0117****3826\nبرداشت: 5,137,200 ریال\nاز طريق: پایانه فروش\nمانده: 742,891 ریال\n1405/02/11\n09:41",
  },
  {
    label: "بلو (واقعی)",
    text: "بلو؛ موجودی حساب شما 312,540,078 ریال است.\nمشتری گرامی، 318,000 ریال از حساب شما پرید.\n1405.04.27 - 20:07",
  },
  {
    label: "شهر (واقعی)",
    text: "برداشت از: 07773456\nمبلغ: 3,500,000 ریال\nموجودی: 6,180,000 ریال\n15:42:08 - 1405/04/19",
  },
  {
    label: "انتقال + (واقعی)",
    text: "انتقال: 75,000,000+ ریال\nموجودی: 18,246,309 ریال\nکارت: 54012****7890\n0617 - 21:55",
  },
  {
    label: "ملی + (واقعی)",
    text: "انتقال: 65,000,000+ ریال\nمانده: 71,204,936 ریال\n0620-14:48",
  },
  {
    label: "پارسیان − (واقعی)",
    text: "90000718817007\nمبلغ: 450,000-\nمانده: 193,845,027\n05/30",
  },
  {
    label: "پاسارگاد − (واقعی)",
    text: "371.4000.70521463.9\n-750,000 ریال\nموجودی: 918,203 ریال\n05/03_18:33\n17:08",
  },
];

/* ---------------- کامپوننت‌های کوچک ---------------- */

function Row({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-[11px] text-slate-400 shrink-0">{label}</span>
      <span className={`text-[11px] font-bold text-left ${warn ? "text-amber-600" : "text-slate-700"}`}>{value}</span>
    </div>
  );
}

function KindBadge({ kind }: { kind: IntakeResponse["kind"] }) {
  if (kind === "deposit") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
        <ArrowDownLeft className="w-3.5 h-3.5" /> واریز
      </span>
    );
  }
  if (kind === "withdrawal") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2.5 py-1">
        <ArrowUpRight className="w-3.5 h-3.5" /> برداشت
      </span>
    );
  }
  if (kind === "fee") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
        <Percent className="w-3.5 h-3.5" /> کارمزد
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
      نامشخص
    </span>
  );
}

/* ---------------- صفحه ---------------- */

export default function QuickAddPage() {
  const [text, setText] = useState("");
  const [desc, setDesc] = useState("");
  const [tokenRequired, setTokenRequired] = useState(false);
  const [token, setToken] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const [created, setCreated] = useState<IntakeResponse | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const pageOrigin = window.location.origin;
    const savedToken = localStorage.getItem("sms_intake_token");
    fetch("/api/sms-intake")
      .then((r) => r.json())
      .then((d) => {
        setOrigin(pageOrigin);
        setTokenRequired(Boolean(d.tokenRequired));
        if (savedToken) setToken(savedToken);
      })
      .catch(() => {
        setOrigin(pageOrigin);
      });
  }, []);

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* بی‌اهمیت */
    }
  };

  const analyze = async () => {
    if (!text.trim() || analyzing) return;
    setAnalyzing(true);
    setResult(null);
    setCreated(null);
    try {
      const res = await fetch("/api/sms-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, token, description: desc, dryRun: true }),
      });
      setResult(await res.json());
    } catch {
      setResult({ ok: false, message: "ارتباط با سرور برقرار نشد." });
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = async () => {
    if (!text.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/sms-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, token, description: desc }),
      });
      const data: IntakeResponse = await res.json();
      if (data.ok && data.created) {
        setCreated(data);
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setResult({ ok: false, message: "ارتباط با سرور برقرار نشد." });
    } finally {
      setCreating(false);
    }
  };

  const canCreate =
    result &&
    result.ok &&
    !result.duplicate &&
    !result.needsAccount &&
    result.account &&
    result.kind !== "unknown" &&
    !created;

  const endpoint = `${origin}/api/sms-intake?format=text`;

  return (
    <div dir="rtl" className="min-h-screen bg-[#ecf4f9] text-slate-800 antialiased">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* هدر */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-black text-slate-800 flex items-center gap-2">
              <MessageSquareText className="w-5 h-5 text-sky-600" />
              ثبت سریع از پیامک
            </h1>
            <p className="text-[11px] text-slate-400 mt-1">
              پیامک بانکی را بچسبانید — نوع، مبلغ، تاریخ و حساب بانکی خودکار تشخیص داده می‌شود
            </p>
          </div>
          <Link
            href="/"
            className="text-[11px] font-bold text-sky-600 hover:text-sky-700 bg-white border border-sky-100 rounded-xl px-3 py-2 shadow-sm"
          >
            ← کیف پول
          </Link>
        </div>

        {/* جعبه متن پیامک */}
        <div className="bg-white rounded-3xl border border-sky-100 shadow-sm p-4 space-y-3">
          <label className="text-xs font-bold text-slate-700">متن پیامک بانکی</label>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
              setCreated(null);
            }}
            rows={4}
            dir="auto"
            placeholder="مثلاً: برداشت کارت 6219-86**-****-9023; مبلغ:4,500,000ريال; مانده:..."
            className="w-full text-xs leading-relaxed bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none placeholder:text-slate-300"
          />

          {/* شرح دلخواه — مثل همان چیزی که شورتکات قبل از ارسال می‌پرسد */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">شرح تراکنش (اختیاری)</label>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              dir="auto"
              placeholder="مثلاً: خرید هفتگی — اگر خالی بماند متن پیامک ذخیره می‌شود"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent placeholder:text-slate-300"
            />
          </div>

          {/* نمونه‌ها */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] text-slate-400 self-center">نمونه برای تست:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  setText(s.text);
                  setResult(null);
                  setCreated(null);
                }}
                className="text-[10px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-full px-2.5 py-1 transition"
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={analyze}
              disabled={!text.trim() || analyzing}
              className="flex-1 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold flex items-center justify-center gap-2 transition active:scale-[0.98]"
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardPaste className="w-4 h-4" />}
              {analyzing ? "در حال تحلیل…" : "تحلیل پیامک"}
            </button>
          </div>
        </div>

        {/* نتیجه تحلیل */}
        {result && !result.ok && (
          <div className="bg-white rounded-3xl border border-rose-100 shadow-sm p-4 flex items-start gap-2.5">
            <TriangleAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-700 font-semibold leading-relaxed">{result.message}</div>
          </div>
        )}

        {result && result.ok && (
          <div className="bg-white rounded-3xl border border-sky-100 shadow-sm p-4 space-y-1">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <KindBadge kind={result.kind} />
              {result.duplicate && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  قبلاً ثبت شده
                </span>
              )}
            </div>

            <Row label="مبلغ" value={`${formatMoney(result.amount || 0)} ریال`} />
            {result.amountSign && (
              <Row label="علامت کنار مبلغ" value={result.amountSign === "+" ? "＋ (نشانه واریز)" : "－ (نشانه برداشت)"} />
            )}
            {result.description && <Row label="شرح" value={result.description} />}
            {(result.fee || 0) > 0 && <Row label="کارمزد" value={`${formatMoney(result.fee || 0)} ریال`} />}
            {result.account ? (
              <Row
                label="حساب بانکی"
                value={
                  <>
                    {result.account.name}
                    <span className="font-normal text-slate-400"> (تطبیق با {result.matchedVia})</span>
                  </>
                }
              />
            ) : (
              <Row label="حساب بانکی" value="پیدا نشد!" warn />
            )}
            <Row
              label="تاریخ"
              value={
                <>
                  {result.shamsiDate}
                  <span className="font-normal text-slate-400">
                    {result.hasExplicitDate ? " (از پیامک)" : " (امروز — در پیامک تاریخ نبود)"}
                  </span>
                </>
              }
            />
            {result.balance != null && result.balance > 0 && (
              <Row label="مانده اعلامی" value={`${formatMoney(result.balance)} ریال`} />
            )}
            {result.tracking && <Row label="کد پیگیری" value={result.tracking} />}
            {result.counterpartyHint && <Row label="طرف مقابل" value={result.counterpartyHint} />}
            {result.plannedFromName && result.plannedToName && (
              <Row label="طرح تراکنش" value={`${result.plannedFromName} ← ${result.plannedToName}`} />
            )}
            <Row
              label="وضعیت پس از ثبت"
              value={
                result.plannedStatus === "pending" ? (
                  <span className="text-amber-600">در انتظار دسته‌بندی</span>
                ) : (
                  <span className="text-emerald-600">فعال (کامل)</span>
                )
              }
            />

            {result.needsAccount && (
              <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[10px] text-amber-700 leading-relaxed">
                برای تشخیص خودکار، شماره کارت یا حساب بانک را در «اطلاعات تکمیلی» آن حساب ذخیره کنید؛
                مثلاً: <span className="font-mono">کارت: 6219-8610-4312-9023</span>
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={!canCreate || creating}
              className="mt-3 w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold flex items-center justify-center gap-2 transition active:scale-[0.98]"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {creating ? "در حال ثبت…" : "ثبت تراکنش"}
            </button>
          </div>
        )}

        {/* نتیجه ثبت موفق */}
        {created && (
          <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-800 font-bold leading-relaxed">{created.message}</div>
            </div>
            <div className="text-[10px] text-slate-400 leading-relaxed">
              برای تکمیل، از صفحه اصلی روی این تراکنش بزنید و سرفصل یا طرف حساب واقعی را انتخاب کنید —
              برچسب «در انتظار» به‌طور خودکار برداشته می‌شود.
            </div>
            <div className="flex gap-2">
              <Link
                href="/"
                className="flex-1 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
              >
                مشاهده در کیف پول
              </Link>
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setResult(null);
                  setCreated(null);
                }}
                className="flex-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition active:scale-[0.98]"
              >
                ثبت پیامک بعدی
              </button>
            </div>
          </div>
        )}

        {/* ستاپ شورتکات iOS */}
        <div className="bg-white rounded-3xl border border-sky-100 shadow-sm p-4 space-y-3">
          <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-sky-600" />
            ستاپ شورتکات iOS
          </h2>

          <div className="space-y-1.5">
            <div className="text-[10px] text-slate-400">۱) آدرس اندپوینت (در اکشن «Get Contents of URL»):</div>
            <div className="flex items-center gap-1.5">
              <code dir="ltr" className="flex-1 text-[10px] font-mono bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 truncate">
                {endpoint || "…"}
              </code>
              <button
                type="button"
                onClick={() => copy(endpoint, "endpoint")}
                className="shrink-0 p-2 rounded-xl bg-sky-50 text-sky-600 hover:bg-sky-100 transition"
                title="کپی"
              >
                {copied === "endpoint" ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {tokenRequired && (
            <div className="space-y-1.5">
              <div className="text-[10px] text-slate-400">
                ۲) توکن (مقدار SMS_INTAKE_TOKEN روی سرور — در فیلد token بدنه درخواست):
              </div>
              <input
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  localStorage.setItem("sms_intake_token", e.target.value);
                }}
                dir="ltr"
                placeholder="توکن"
                className="w-full text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          )}

          <ol className="text-[10px] text-slate-500 leading-relaxed space-y-1.5 list-decimal list-inside">
            <li>در اپ Shortcuts (میان‌برها) یک شورتکات جدید بسازید.</li>
            <li>
              اکشن <b>Ask for Input</b> (درخواست ورودی) اضافه کنید — سوال: «شرح تراکنش؟» (خالی هم می‌شود رد کرد).
            </li>
            <li>اکشن <b>Get Clipboard</b> (دریافت کلیپ‌بورد) اضافه کنید.</li>
            <li>
              اکشن <b>Get Contents of URL</b> اضافه کنید — Method: <b>POST</b>، Request Body: <b>JSON</b>،
              فیلد <code dir="ltr">text</code> = متغیر Clipboard، فیلد <code dir="ltr">description</code> = ورودی مرحله اول
              {tokenRequired ? "، فیلد token = توکن" : ""}.
            </li>
            <li>
              اکشن <b>Show Notification</b> (نمایش اعلان) اضافه کنید و مقدارش را خروجی مرحله قبل بگذارید.
            </li>
            <li>
              برای اجرای سریع، شورتکات را به <b>ضربه دوتایی پشت گوشی</b> (Back Tap) یا صفحه اصلی اختصاص دهید.
            </li>
          </ol>

          <div className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 pt-2.5">
            راهنمای کامل قدم‌به‌قدم (شامل حالت اجرای خودکار با دریافت پیامک): فایل{" "}
            <b>SHORTCUT-SETUP.md</b> در ریپازیتوری پروژه.
          </div>
        </div>

        {/* توضیح جریان کار */}
        <div className="bg-gradient-to-br from-sky-50/70 to-white rounded-3xl border border-sky-100 p-4 space-y-2">
          <h3 className="text-xs font-bold text-sky-950">این صفحه چطور کار می‌کند؟</h3>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            این صفحه دقیقاً همان اندپوینتی را صدا می‌زند که شورتکات iOS استفاده می‌کند
            (<code dir="ltr">/api/sms-intake</code>)؛ یعنی اگر پیامکی اینجا درست پارس شد، از شورتکات هم
            درست ثبت می‌شود. تراکنش‌های ثبت‌شده از پیامک با برچسب «در انتظار» در صفحه اصلی دیده می‌شوند و
            با انتخاب سرفصل واقعی، تکمیل می‌گردند.
          </p>
        </div>

        <div className="text-center text-[10px] text-slate-400 pb-4">
          کیف پول هوشمند — قابلیت آزمایشی ثبت سریع از پیامک
        </div>
      </div>
    </div>
  );
}
