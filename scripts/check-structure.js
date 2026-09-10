/**
 * بررسی ساختار پروژه قبل از بیلد.
 * اگر فایل‌ها در مسیر اشتباه آپلود شده باشند، پیام خطای گویا به فارسی نمایش می‌دهد.
 */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const required = ["package.json", "next.config.ts", path.join("src", "app", "page.tsx")];
const missing = required.filter((f) => !fs.existsSync(path.join(root, f)));

if (missing.length === 0) {
  process.exit(0);
}

// جستجو برای یافتن پوشه‌ای که احتمالاً پروژه در آن قرار گرفته
let nestedHint = "";
try {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
    if (fs.existsSync(path.join(root, e.name, "src", "app", "page.tsx"))) {
      nestedHint = e.name;
      break;
    }
  }
} catch {
  /* نادیده گرفته می‌شود */
}

const line = "═".repeat(64);
console.error(`\n${line}`);
console.error("❌  ساختار پروژه صحیح نیست — بیلد متوقف شد");
console.error(line);
console.error("\nفایل‌های زیر در ریشه پروژه پیدا نشدند:");
for (const f of missing) console.error(`   • ${f}`);

if (nestedHint) {
  console.error(`\n🔍  پروژه در پوشه داخلی «${nestedHint}» قرار دارد.`);
  console.error("\nراه‌حل (یکی از دو روش):");
  console.error("   ۱) در Vercel → Settings → General → Root Directory");
  console.error(`      مقدار را روی «${nestedHint}» تنظیم کنید و Redeploy بزنید.`);
  console.error("   ۲) یا در GitHub محتوای آن پوشه را به ریشه ریپازیتوری منتقل کنید.");
} else {
  console.error("\nراه‌حل: مطمئن شوید فایل package.json و پوشه src مستقیماً در ریشه");
  console.error("ریپازیتوری GitHub قرار دارند، نه داخل یک پوشه دیگر.");
}

console.error(`\n${line}\n`);
process.exit(1);
