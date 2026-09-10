"use client";

import { useLockBodyScroll } from "@/lib/use-lock-body-scroll";
import React, { useState } from "react";
import { Lock, User, KeyRound, Eye, EyeOff, ShieldCheck, X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onLoginSuccess: (user: { id: string; username: string; fullName?: string | null }) => void;
  onClose?: () => void;
  isChangePasswordOnly?: boolean;
}

export function LoginModal({
  isOpen,
  onLoginSuccess,
  onClose,
  isChangePasswordOnly = false,
}: Props) {
  useLockBodyScroll(isOpen);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isChangePasswordOnly ? "changePassword" : "login",
          username: username.trim(),
          password,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطای ورود به سیستم");

      if (isChangePasswordOnly) {
        setSuccessMsg("رمز عبور با موفقیت تغییر یافت.");
        setTimeout(() => {
          if (onClose) onClose();
        }, 1200);
      } else {
        onLoginSuccess(data.user);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطای احراز هویت";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border border-sky-100 flex flex-col">
        {/* iOS Style Top Brand */}
        <div className="bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-500 text-white p-6 text-center relative">
          {onClose && isChangePasswordOnly && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 left-4 p-1 rounded-full hover:bg-white/20 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="w-16 h-16 mx-auto mb-3 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm shadow-inner border border-white/30">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">کیف پول هوشمند آیفون</h2>
          <p className="text-xs text-sky-100 mt-1">
            {isChangePasswordOnly
              ? "تغییر رمز عبور حساب کاربری"
              : "سامانه مدیریت مالی و کیف پول ابری"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-600 rounded-xl">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl">
              {successMsg}
            </div>
          )}

          {!isChangePasswordOnly && (
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-sky-600" />
                <span>نام کاربری</span>
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="نام کاربری (پیش‌فرض: admin)"
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 dir-ltr text-left"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-sky-600" />
              <span>{isChangePasswordOnly ? "رمز عبور فعلی" : "رمز عبور"}</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isChangePasswordOnly ? "رمز عبور فعلی" : "رمز عبور (پیش‌فرض: 123456)"}
                className="w-full pr-3.5 pl-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 dir-ltr text-left"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isChangePasswordOnly && (
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>رمز عبور جدید</span>
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="حداقل ۴ کاراکتر"
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 dir-ltr text-left"
              />
            </div>
          )}

          {!isChangePasswordOnly && (
            <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-100 text-[11px] text-sky-800 leading-relaxed">
              💡 برای ورود اولیه می‌توانید از نام کاربری <b className="font-mono">admin</b> و رمز{" "}
              <b className="font-mono">123456</b> استفاده نمایید.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-2xl shadow-md shadow-sky-200 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>لطفاً صبر کنید...</span>
            ) : isChangePasswordOnly ? (
              <span>ثبت رمز عبور جدید</span>
            ) : (
              <span>ورود به نرم‌افزار</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
