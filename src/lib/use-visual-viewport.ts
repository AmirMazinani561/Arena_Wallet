"use client";

import { useEffect, useState, type CSSProperties } from "react";

interface ViewportBox {
  top: number;
  height: number;
  ready: boolean;
}

/**
 * ردیابی ناحیه‌ی واقعاً قابل‌مشاهده‌ی صفحه (بالای کیبورد) در Safari آیفون.
 *
 * وقتی کیبورد باز می‌شود، Safari ارتفاع layout viewport را تغییر نمی‌دهد و به جای آن
 * visual viewport را کوچک و جابه‌جا می‌کند. اگر مودال با این مقادیر اندازه بگیرد،
 * هدر و کادر جستجو همیشه بالا و ثابت می‌مانند و هرگز زیر کیبورد یا بیرون صفحه نمی‌روند.
 */
export function useVisualViewport(active: boolean): ViewportBox {
  const [box, setBox] = useState<ViewportBox>({ top: 0, height: 0, ready: false });

  useEffect(() => {
    if (!active) return;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;

    const update = () => {
      if (vv) {
        setBox({ top: Math.max(0, vv.offsetTop), height: vv.height, ready: true });
      } else {
        setBox({ top: 0, height: window.innerHeight, ready: true });
      }
    };

    update();
    if (vv) {
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    }
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      }
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [active]);

  return box;
}

/**
 * استایل آماده برای بدنه‌ی مودال‌های تمام‌صفحه‌ی موبایل:
 * مودال از بالای ناحیه‌ی قابل‌مشاهده شروع می‌شود و دقیقاً تا بالای کیبورد ادامه می‌یابد.
 */
export function useModalViewportStyle(active: boolean): CSSProperties {
  const { top, height, ready } = useVisualViewport(active);
  if (!ready) return { position: "fixed", top: 0, left: 0, right: 0, bottom: 0 };
  return {
    position: "fixed",
    top,
    left: 0,
    right: 0,
    height,
    transition: "height 120ms ease-out",
  };
}

/**
 * با زدن کلید Return/Enter کیبورد بسته می‌شود.
 * (برای ورودی‌هایی که Enter نباید فرم را ارسال کند)
 */
export function blurOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
    (e.target as HTMLInputElement).blur();
  }
}
