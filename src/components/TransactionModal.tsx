"use client";

import { useLockBodyScroll } from "@/lib/use-lock-body-scroll";
import { useModalViewportStyle, blurOnEnter } from "@/lib/use-visual-viewport";
import React, { useState, useEffect } from "react";
import { Account, Transaction } from "@/types";
import { getCurrentShamsi, separateThousands, parseAmount } from "@/lib/date-utils";
import {
  X,
  Check,
  Trash2,
  Landmark,
  Wallet,
  Users,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
} from "lucide-react";
import { AccountPickerModal } from "./AccountPickerModal";
import { ShamsiDatePicker } from "./ShamsiDatePicker";
import { AmountInput } from "./AmountInput";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editTx?: Transaction | null;
  allAccounts: Account[];
  onRefreshAccounts: () => void;
  presetFromAccountId?: string | null;
  presetToAccountId?: string | null;
  onDelete?: (id: string) => void;
}

function isValidPair(from?: Account, to?: Account): { ok: boolean; error?: string } {
  if (!from || !to) return { ok: false, error: "لطفاً حساب مبدا و مقصد را مشخص نمایید." };
  if (from.id === to.id) return { ok: false, error: "مبدا و مقصد نمی‌توانند یکسان باشند." };
  const asset = ["bank", "cash", "person"];
  const fa = asset.includes(from.type);
  const ta = asset.includes(to.type);
  if (fa && to.type === "expense") return { ok: true };
  if (from.type === "income" && ta) return { ok: true };
  if (fa && ta) return { ok: true };
  if (from.type === "expense") return { ok: false, error: "سرفصل هزینه نمی‌تواند مبدا باشد." };
  if (to.type === "income") return { ok: false, error: "سرفصل درآمد نمی‌تواند مقصد باشد." };
  return { ok: false, error: "ترکیب انتخابی مجاز نیست." };
}

function AccountBadge({ acc, placeholder }: { acc?: Account; placeholder: string }) {
  if (!acc) return <span className="text-xs text-slate-400">{placeholder}</span>;

  const icon =
    acc.type === "bank" ? (
      <Landmark className="w-4 h-4 text-sky-600" />
    ) : acc.type === "cash" ? (
      <Wallet className="w-4 h-4 text-emerald-600" />
    ) : acc.type === "person" ? (
      <Users className="w-4 h-4 text-purple-600" />
    ) : acc.type === "expense" ? (
      <ArrowDownRight className="w-4 h-4 text-rose-500" />
    ) : (
      <ArrowUpRight className="w-4 h-4 text-emerald-500" />
    );

  const bg =
    acc.type === "bank"
      ? "bg-sky-50"
      : acc.type === "cash"
      ? "bg-emerald-50"
      : acc.type === "person"
      ? "bg-purple-50"
      : acc.type === "expense"
      ? "bg-rose-50"
      : "bg-emerald-50";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center shrink-0`}>{icon}</div>
      <div className="text-xs font-bold text-slate-800 truncate">{acc.name}</div>
    </div>
  );
}

export function TransactionModal({
  isOpen,
  onClose,
  onSuccess,
  editTx = null,
  allAccounts,
  onRefreshAccounts,
  presetFromAccountId = null,
  presetToAccountId = null,
  onDelete,
}: Props) {
  useLockBodyScroll(isOpen);
  const viewportStyle = useModalViewportStyle(isOpen);
  const currentShamsi = getCurrentShamsi();

  const [amountText, setAmountText] = useState("");
  const [feeText, setFeeText] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [shamsiDate, setShamsiDate] = useState(currentShamsi.formatted);
  const [description, setDescription] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<"from" | "to" | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (editTx) {
      setAmountText(separateThousands(String(editTx.amount)));
      setFeeText(editTx.fee ? separateThousands(String(editTx.fee)) : "");
      setFromAccountId(editTx.fromAccountId);
      setToAccountId(editTx.toAccountId);
      setShamsiDate(editTx.shamsiDate);
      setDescription(editTx.description || "");
      setTrackingNumber(editTx.trackingNumber || "");
    } else {
      setAmountText("");
      setFeeText("");
      setShamsiDate(currentShamsi.formatted);
      setDescription("");
      setTrackingNumber("");
      setFromAccountId(presetFromAccountId || "");
      setToAccountId(presetToAccountId || "");
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editTx, presetFromAccountId, presetToAccountId]);

  if (!isOpen) return null;

  const fromAccount = allAccounts.find((a) => a.id === fromAccountId);
  const toAccount = allAccounts.find((a) => a.id === toAccountId);
  const amountValue = parseAmount(amountText);
  const feeValue = parseAmount(feeText);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pair = isValidPair(fromAccount, toAccount);
    if (!pair.ok) {
      setError(pair.error || "خطا");
      return;
    }
    if (!amountValue || amountValue <= 0) {
      setError("لطفاً مبلغ معتبری وارد نمایید.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: editTx ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editTx ? editTx.id : undefined,
          amount: amountValue,
          fee: feeValue,
          fromAccountId,
          toAccountId,
          shamsiDate,
          description: description.trim() || null,
          trackingNumber: trackingNumber.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در ثبت تراکنش");
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطای ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  };

  const labelCls = "text-xs font-semibold text-slate-600 mb-1 block";
  const inputCls =
    "w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition";

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }} />
      <div style={viewportStyle} className="z-[51] flex justify-center pointer-events-none">
        <div
          className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col pointer-events-auto sm:my-3 sm:h-[calc(100%-1.5rem)] sm:rounded-3xl sm:border sm:border-sky-100 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* هدر ثابت */}
          <div
            className="shrink-0 bg-gradient-to-r from-sky-600 to-sky-500 text-white px-4 pb-3 flex items-center justify-between"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            <span className="font-bold text-base">{editTx ? "ویرایش تراکنش" : "ثبت تراکنش"}</span>
            <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-white/20 transition">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* بدنه اسکرول‌شونده (فقط همین بخش اسکرول می‌شود) */}
          <form
            onSubmit={handleSubmit}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {error && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-600 rounded-xl">{error}</div>
            )}

            {/* ۱. حساب مبدا و مقصد — دو کادر جدا */}
            <div>
              <label className={labelCls}>حساب مبدا</label>
              <button
                type="button"
                onClick={() => setPickerTarget("from")}
                className="w-full p-3 text-right bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 rounded-xl transition flex items-center justify-between gap-2"
              >
                <AccountBadge acc={fromAccount} placeholder="انتخاب حساب مبدا…" />
                <ChevronLeft className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            </div>

            <div>
              <label className={labelCls}>حساب مقصد</label>
              <button
                type="button"
                onClick={() => setPickerTarget("to")}
                className="w-full p-3 text-right bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 rounded-xl transition flex items-center justify-between gap-2"
              >
                <AccountBadge acc={toAccount} placeholder="انتخاب حساب مقصد…" />
                <ChevronLeft className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            </div>

            {/* ۲. مبلغ */}
            <div>
              <label className={`${labelCls} text-center`}>مبلغ</label>
              <AmountInput value={amountText} onChange={(f) => setAmountText(f)} big center />
            </div>

            {/* ۳. کارمزد */}
            <div>
              <label className={`${labelCls} text-center`}>کارمزد</label>
              <AmountInput value={feeText} onChange={(f) => setFeeText(f)} placeholder="۰" showHint={false} center />
            </div>

            {/* ۴. تاریخ */}
            <ShamsiDatePicker label="تاریخ" value={shamsiDate} onChange={setShamsiDate} />

            {/* ۵. شرح و ۶. کد پیگیری */}
            <div className="space-y-3">
              <div>
                <label className={labelCls}>شرح</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={blurOnEnter}
                  enterKeyHint="done"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>کد پیگیری</label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  onKeyDown={blurOnEnter}
                  enterKeyHint="done"
                  placeholder="اختیاری"
                  className={`${inputCls} dir-ltr text-left`}
                />
              </div>
            </div>

            {editTx && onDelete && (
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  if (confirm("آیا از حذف این تراکنش اطمینان دارید؟")) {
                    onDelete(editTx.id);
                    onClose();
                  }
                }}
                className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-2xl border border-rose-200 transition flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف این تراکنش</span>
              </button>
            )}
          </form>

          {/* دکمه‌های ثابت پایین */}
          <div
            className="shrink-0 p-4 pt-3 border-t border-slate-100 bg-white flex gap-2"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-3 px-4 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-semibold rounded-2xl shadow-md shadow-sky-200 transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>در حال ذخیره…</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{editTx ? "به‌روزرسانی" : "ثبت"}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-2xl transition"
            >
              انصراف
            </button>
          </div>
        </div>
      </div>

      {pickerTarget && (
        <AccountPickerModal
          isOpen
          onClose={() => setPickerTarget(null)}
          title={pickerTarget === "from" ? "انتخاب حساب مبدا" : "انتخاب حساب مقصد"}
          allowedTypes={
            pickerTarget === "from"
              ? ["bank", "cash", "person", "income"]
              : ["bank", "cash", "person", "expense"]
          }
          selectedId={pickerTarget === "from" ? fromAccountId : toAccountId}
          allAccounts={allAccounts}
          onSelect={(acc) => {
            if (pickerTarget === "from") setFromAccountId(acc.id);
            else setToAccountId(acc.id);
          }}
          onAccountCreated={(newAcc) => {
            onRefreshAccounts();
            if (pickerTarget === "from") setFromAccountId(newAcc.id);
            else setToAccountId(newAcc.id);
          }}
        />
      )}
    </>
  );
}
