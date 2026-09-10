"use client";

import React from "react";

interface Props {
  className?: string;
  size?: number;
}

/**
 * لوگوی اختصاصی کیف پول هوشمند — وکتور مدرن با گرادیان آبی آسمانی.
 * به صورت درون‌برنامه‌ای رندر می‌شود؛ بدون نیاز به درخواست شبکه و با نمایش آنی ۱۰۰٪ پایدار.
 */
export function WalletLogo({ className = "w-8 h-8", size = 32 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 block rounded-[10px] shadow-md shadow-sky-500/25 ${className}`}
      aria-hidden="true"
    >
      <defs>
        {/* گرادیان پس‌زمینه آیکون */}
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="55%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>

        {/* کارت بیرون‌آمده طلایی */}
        <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>

        {/* بدنه کیف پول */}
        <linearGradient id="walletBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f0f9ff" />
        </linearGradient>

        {/* زبانه کیف پول */}
        <linearGradient id="flapGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#075985" />
        </linearGradient>

        {/* سایه نرم */}
        <filter id="softGlow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0c4a6e" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* کادر پس‌زمینه مربع با گوشه‌های گرد iOS */}
      <rect width="100" height="100" rx="22" fill="url(#bgGrad)" />

      {/* کارت بانکی طلایی داخل کیف */}
      <rect
        x="28"
        y="23"
        width="44"
        height="26"
        rx="5"
        fill="url(#cardGrad)"
        opacity="0.95"
      />
      <line x1="33" y1="29" x2="48" y2="29" stroke="#78350f" strokeWidth="2" strokeLinecap="round" opacity="0.6" />

      {/* بدنه اصلی کیف پول سفید */}
      <rect
        x="18"
        y="34"
        width="64"
        height="45"
        rx="10"
        fill="url(#walletBody)"
        filter="url(#softGlow)"
      />

      {/* دوخت لبه کیف پول */}
      <line x1="24" y1="40" x2="76" y2="40" stroke="#bae6fd" strokeWidth="1.5" strokeDasharray="3 2" />

      {/* زبانه قفل چرمی آبی در سمت چپ */}
      <path
        d="M 52 46 L 76 46 A 8 8 0 0 1 84 54 L 84 58 A 8 8 0 0 1 76 66 L 52 66 Z"
        fill="url(#flapGrad)"
      />

      {/* دکمه فلزی قفل */}
      <circle cx="74" cy="56" r="4" fill="#e0f2fe" />
      <circle cx="74" cy="56" r="2" fill="#0284c7" />
    </svg>
  );
}
