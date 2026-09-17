"use client";

import { useLockBodyScroll } from "@/lib/use-lock-body-scroll";
import { useModalViewportStyle, blurOnEnter } from "@/lib/use-visual-viewport";
import React, { useState, useEffect } from "react";
import { Account, AccountType } from "@/types";
import { X, Check, Landmark, Wallet, Users, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { AmountInput } from "./AmountInput";
import { separateThousands, parseAmount } from "@/lib/date-utils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdAcc?: Account) => void;
  initialType?: AccountType;
  initialParentId?: string | null;
  editAccount?: Account | null;
  allAccounts: Account[];
}

export function CreateAccountModal({
  isOpen,
  onClose,
  onSuccess,
  initialType = "bank",
  initialParentId = null,
  editAccount = null,
  allAccounts,
}: Props) {
  useLockBodyScroll(isOpen);
  const viewportStyle = useModalViewportStyle(isOpen);
  const [type, setType] = useState<AccountType>(initialType);
  const [name, setName] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [balanceSign, setBalanceSign] = useState<1 | -1>(1);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isParent, setIsParent] = useState(false);
  const [parentId, setParentId] = useState<string>("");
  const [detailInfo, setDetailInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when opening or editing
  useEffect(() => {
    if (editAccount) {
      setType(editAccount.type);
      setName(editAccount.name);
      setInitialBalance(separateThousands(String(Math.abs(editAccount.initialBalance || 0))));
      setBalanceSign((editAccount.initialBalance || 0) < 0 ? -1 : 1);
      setIsFavorite(editAccount.isFavorite);
      setIsParent(editAccount.isParent);
      setParentId(editAccount.parentId || "");
      setDetailInfo(editAccount.detailInfo || "");
    } else {
      setType(initialType);
      setName("");
      setInitialBalance("");
      setBalanceSign(1);
      setIsFavorite(false);
      // پیش‌فرض برای هزینه/درآمد: زیرمجموعه
      setIsParent(false);
      setParentId(initialParentId || "");
      setDetailInfo("");
    }
    setError(null);
  }, [isOpen, editAccount, initialType, initialParentId]);

  if (!isOpen) return null;

  // Available parent categories for income/expense
  const parentCandidates = allAccounts
    .filter((a) => a.type === type && a.isParent && (editAccount ? a.id !== editAccount.id : true))
    .sort((a, b) => a.name.localeCompare(b.name, "fa"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("لطفاً نام حساب را وارد نمایید.");
      return;
    }

    if ((type === "income" || type === "expense") && !isParent && !parentId) {
      setError("لطفاً سرفصل والد این زیرمجموعه را انتخاب کنید یا آن را به عنوان سرفصل ثبت نمایید.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        id: editAccount ? editAccount.id : undefined,
        type,
        name: name.trim(),
        initialBalance:
          type === "person"
            ? parseAmount(initialBalance) * balanceSign
            : parseAmount(initialBalance),
        isFavorite,
        isParent: type === "income" || type === "expense" ? isParent : false,
        parentId: type === "income" || type === "expense" ? (!isParent ? parentId : null) : null,
        detailInfo: detailInfo.trim() || null,
      };

      const res = await fetch("/api/accounts", {
        method: editAccount ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "خطا در ذخیره حساب");
      }

      onSuccess(data.account);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطای ارتباط با سرور";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }} />
    <div style={viewportStyle} className="z-[71] flex justify-center pointer-events-none">
      <div
        className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col pointer-events-auto sm:my-3 sm:h-[calc(100%-1.5rem)] sm:rounded-3xl sm:border sm:border-sky-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 bg-gradient-to-r from-sky-600 to-sky-500 text-white px-4 pb-3 flex items-center justify-between" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg">
              {editAccount ? "ویرایش حساب" : "ایجاد حساب جدید"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {error && (
            <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-600 rounded-xl">
              {error}
            </div>
          )}

          {/* Type Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">نوع حساب</label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 text-xs font-medium">
              <button
                type="button"
                onClick={() => {
                  setType("bank");
                  setIsParent(false);
                }}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  type === "bank"
                    ? "bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-200"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Landmark className="w-4 h-4" />
                <span>بانک</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType("cash");
                  setIsParent(false);
                }}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  type === "cash"
                    ? "bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-200"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Wallet className="w-4 h-4" />
                <span>صندوق</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType("person");
                  setIsParent(false);
                }}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  type === "person"
                    ? "bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-200"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Users className="w-4 h-4" />
                <span>شخص</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType("expense");
                  setIsParent(false);
                  setParentId("");
                }}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  type === "expense"
                    ? "bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-200"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <ArrowDownRight className="w-4 h-4" />
                <span>هزینه</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType("income");
                  setIsParent(false);
                  setParentId("");
                }}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  type === "income"
                    ? "bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-200"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>درآمد</span>
              </button>
            </div>
          </div>

          {/* Name Field */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">
              نام حساب / عنوان
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={blurOnEnter}
              enterKeyHint="done"
              placeholder={
                type === "bank"
                  ? "مثلاً: بانک پاسارگاد"
                  : type === "cash"
                  ? "مثلاً: صندوق منزل یا گاوصندوق"
                  : type === "person"
                  ? "مثلاً: علی رضایی (همکار)"
                  : type === "expense"
                  ? (isParent ? "مثلاً: هزینه‌های درمانی و پزشکی" : "مثلاً: ویزیت پزشک یا دارو")
                  : (isParent ? "مثلاً: درآمدهای جانبی" : "مثلاً: فروش آنلاین")
              }
              className="w-full px-3.5 py-2.5 text-sm bg-sky-50/50 border border-sky-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
            />
          </div>

          {/* Initial Balance for Bank, Cash, Person */}
          {(type === "bank" || type === "cash" || type === "person") && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-600">مانده اولیه (ریال)</label>
              </div>

              {type === "person" && (
                <div className="grid grid-cols-2 gap-1.5 mb-2 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setBalanceSign(1)}
                    className={`py-1.5 rounded-xl border transition ${
                      balanceSign === 1
                        ? "bg-emerald-500 text-white border-emerald-500"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    طلب ما از این شخص
                  </button>
                  <button
                    type="button"
                    onClick={() => setBalanceSign(-1)}
                    className={`py-1.5 rounded-xl border transition ${
                      balanceSign === -1
                        ? "bg-rose-500 text-white border-rose-500"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    بدهی ما به این شخص
                  </button>
                </div>
              )}

              <AmountInput
                value={initialBalance}
                onChange={(formatted) => setInitialBalance(formatted)}
                placeholder="۰"
              />
            </div>
          )}

          {/* Hierarchical options for Income & Expense */}
          {(type === "income" || type === "expense") && (
            <div className="space-y-3 p-3 bg-sky-50/50 rounded-2xl border border-sky-100">
              <div className="text-xs font-semibold text-slate-700">سطح دسته‌بندی:</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* زیرمجموعه اول و پیش‌فرض */}
                <button
                  type="button"
                  onClick={() => setIsParent(false)}
                  className={`py-2 px-3 rounded-xl border font-medium transition ${
                    !isParent
                      ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  زیرمجموعه
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsParent(true);
                    setParentId("");
                  }}
                  className={`py-2 px-3 rounded-xl border font-medium transition ${
                    isParent
                      ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  سرفصل اصلی
                </button>
              </div>

              {!isParent && (
                <div className="pt-2">
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    انتخاب سرفصل والد
                  </label>
                  <select
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-sky-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">-- انتخاب سرفصل اصلی --</option>
                    {parentCandidates.map((parent) => (
                      <option key={parent.id} value={parent.id}>
                        {parent.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Optional Details */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">
              {type === "bank"
                ? "شماره کارت یا حساب (اختیاری)"
                : type === "person"
                ? "شماره تماس / نشانی (اختیاری)"
                : "توضیحات تکمیلی (اختیاری)"}
            </label>
            <input
              type="text"
              value={detailInfo}
              onChange={(e) => setDetailInfo(e.target.value)}
              onKeyDown={blurOnEnter}
              enterKeyHint="done"
              placeholder="مثلاً: ۴۲۸۰-۰۰۰۰-..."
              className="w-full px-3.5 py-2 text-sm bg-sky-50/50 border border-sky-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
            />
          </div>

          {/* Favorite Toggle (تیک منتخب برای صفحه اصلی) */}
          <div className="pt-2">
            <label className="flex items-center gap-3 p-3 bg-sky-50 rounded-2xl border border-sky-200/70 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isFavorite}
                onChange={(e) => setIsFavorite(e.target.checked)}
                className="w-5 h-5 rounded-md text-sky-600 accent-sky-600 focus:ring-sky-500 cursor-pointer"
              />
              <div className="flex-1">
                <div className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                  ⭐ نمایش در صفحه اصلی (حساب منتخب)
                </div>
                <div className="text-[11px] text-slate-500">
                  فقط حساب‌های دارای این تیک در کارت‌های صفحه اصلی نمایش داده می‌شوند.
                </div>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="pt-3 flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-2xl shadow-md shadow-sky-200 transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>در حال ذخیره...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{editAccount ? "به‌روزرسانی حساب" : "ثبت و ایجاد حساب"}</span>
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
        </form>
      </div>
    </div>
    </>
  );
}
