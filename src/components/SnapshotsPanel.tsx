"use client";

import React, { useState, useEffect, useCallback } from "react";
import { formatMoney } from "@/lib/date-utils";
import { ShieldCheck, RotateCcw, Camera, Loader2, AlertTriangle, CloudCheck } from "lucide-react";

interface SnapshotMeta {
  id: string;
  createdAt: string;
  shamsiDate: string;
  source: string;
  accountCount: number;
  transactionCount: number;
  sizeKb: number;
}

interface Props {
  onRestored: () => void;
}

/**
 * پنل اسنپ‌شات‌های خودکار: نمایش بک‌آپ‌های روزانه داخل دیتابیس و امکان بازگردانی
 */
export function SnapshotsPanel({ onRestored }: Props) {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/snapshots");
      const data = await res.json();
      if (res.ok) setSnapshots(data.snapshots || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ type: "ok", text: data.message });
      load();
    } catch (err: unknown) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "خطا" });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (snap: SnapshotMeta) => {
    if (
      !confirm(
        `بازگردانی به وضعیت ${snap.shamsiDate}؟\n\nتمام داده‌های فعلی با این نسخه جایگزین می‌شوند (از وضعیت فعلی نیز یک اسنپ‌شات امن گرفته خواهد شد).`
      )
    )
      return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", id: snap.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ type: "ok", text: data.message });
      load();
      onRestored();
    } catch (err: unknown) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "خطا" });
    } finally {
      setBusy(false);
    }
  };

  // هشدار اگر آخرین اسنپ‌شات قدیمی‌تر از ۳ روز باشد
  const latest = snapshots[0];
  const daysSince = latest
    ? Math.floor((Date.now() - new Date(latest.createdAt).getTime()) / 86400000)
    : null;
  const isStale = daysSince === null || daysSince > 3;

  return (
    <div className="ios-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800">بک‌آپ خودکار روزانه</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              هر شب یک نسخه کامل داخل دیتابیس ذخیره می‌شود (۳۰ نسخه آخر نگهداری می‌شود)
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={createNow}
          disabled={busy}
          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[11px] font-bold rounded-xl flex items-center gap-1 shrink-0"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          <span>اسنپ‌شات الان</span>
        </button>
      </div>

      {/* وضعیت */}
      {!loading && (
        <div
          className={`px-3 py-2 rounded-xl text-[11px] flex items-center gap-2 ${
            isStale
              ? "bg-amber-50 border border-amber-200 text-amber-800"
              : "bg-emerald-50 border border-emerald-200 text-emerald-800"
          }`}
        >
          {isStale ? (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <CloudCheck className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>
            {latest
              ? `آخرین بک‌آپ: ${latest.shamsiDate} (${daysSince === 0 ? "امروز" : `${daysSince} روز پیش`})`
              : "هنوز هیچ بک‌آپ خودکاری ثبت نشده است."}
            {isStale && " — پیشنهاد می‌شود همین حالا یک اسنپ‌شات بگیرید."}
          </span>
        </div>
      )}

      {message && (
        <div
          className={`px-3 py-2 rounded-xl text-[11px] ${
            message.type === "ok"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-rose-50 border border-rose-200 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* لیست اسنپ‌شات‌ها */}
      {loading ? (
        <div className="py-4 text-center">
          <Loader2 className="w-5 h-5 text-sky-500 animate-spin mx-auto" />
        </div>
      ) : snapshots.length > 0 ? (
        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto -mx-1 px-1">
          {snapshots.map((s) => (
            <div key={s.id} className="py-2 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <span className="font-mono dir-ltr">{s.shamsiDate}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded ${
                      s.source === "auto" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {s.source === "auto" ? "خودکار" : "دستی"}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {formatMoney(s.accountCount)} حساب • {formatMoney(s.transactionCount)} تراکنش •{" "}
                  {formatMoney(s.sizeKb)} KB
                </div>
              </div>
              <button
                type="button"
                onClick={() => restore(s)}
                disabled={busy}
                className="px-2 py-1 text-[10px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg flex items-center gap-1 shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                <span>بازگردانی</span>
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <p className="text-[10px] text-slate-400 leading-relaxed">
        ⚠️ این اسنپ‌شات‌ها داخل همان دیتابیس ذخیره می‌شوند و در برابر <b>اشتباه کاربر</b> (حذف یا ویرایش
        ناخواسته) محافظت می‌کنند. برای محافظت در برابر از دست رفتن کل دیتابیس، ماهی یک بار فایل JSON را از بخش
        بالا دانلود و در جای امنی نگه دارید.
      </p>
    </div>
  );
}
