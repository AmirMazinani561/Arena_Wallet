/**
 * فایل راه‌انداز اپلیکیشن برای هاست‌های دایرکت‌ادمین و سی‌پنل.
 *
 * بخش «Setup Node.js App» در دایرکت‌ادمین از Phusion Passenger استفاده می‌کند
 * و به یک فایل شروع (Application startup file) نیاز دارد.
 * نام این فایل را در آن بخش وارد کنید: server.js
 *
 * برای اجرای دستی نیز قابل استفاده است:  node server.js
 */

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

// بارگذاری متغیرهای محیطی از فایل .env در صورت وجود
try {
  require("dotenv").config();
} catch (e) {
  // اگر بسته dotenv نصب نباشد، متغیرها از محیط سیستم خوانده می‌شوند
}

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      try {
        handle(req, res, parse(req.url, true));
      } catch (err) {
        console.error("خطا در پردازش درخواست:", err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    }).listen(port, hostname, () => {
      console.log(`✅ کیف پول هوشمند روی پورت ${port} در حال اجراست`);
    });
  })
  .catch((err) => {
    console.error("❌ خطا در راه‌اندازی برنامه:", err);
    process.exit(1);
  });
