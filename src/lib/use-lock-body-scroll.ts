"use client";

import { useEffect } from "react";

let lockCount = 0;
let savedScrollY = 0;

/**
 * قفل کردن اسکرول صفحه پشتی هنگام باز بودن مودال.
 * روش position:fixed تنها راهی است که در Safari آیفون به‌درستی کار می‌کند.
 * از شمارنده استفاده می‌شود تا با چند مودال تودرتو نیز صحیح عمل کند.
 */
export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const body = document.body;
    if (lockCount === 0) {
      savedScrollY = window.scrollY;
      body.style.position = "fixed";
      body.style.top = `-${savedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        body.style.position = "";
        body.style.top = "";
        body.style.left = "";
        body.style.right = "";
        body.style.width = "";
        body.style.overflow = "";
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [active]);
}
