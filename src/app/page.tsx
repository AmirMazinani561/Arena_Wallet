"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Account, Transaction, AccountType } from "@/types";
import { PENDING_EXPENSE_CATEGORY_ID, PENDING_INCOME_CATEGORY_ID } from "@/lib/pending-categories";
import { TopBar } from "@/components/TopBar";
import { BottomTabBar } from "@/components/BottomTabBar";
import { HomeTab } from "@/components/HomeTab";
import { LedgerView } from "@/components/LedgerView";
import { ReportsTab } from "@/components/ReportsTab";
import { AccountsTab } from "@/components/AccountsTab";
import { SettingsTab } from "@/components/SettingsTab";
import { TransactionModal } from "@/components/TransactionModal";
import { CreateAccountModal } from "@/components/CreateAccountModal";
import { UnifiedSearchModal } from "@/components/UnifiedSearchModal";
import { LoginModal } from "@/components/LoginModal";
import { ActionSheet } from "@/components/ActionSheet";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Smartphone, Monitor, Plus, ListOrdered, Edit2, ArrowUpRight, ArrowDownLeft } from "lucide-react";

export default function App() {
  const [user, setUser] = useState<{ id: string; username: string; fullName?: string | null } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentTab, setCurrentTab] = useState<string>("home");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pendingTxs, setPendingTxs] = useState<Transaction[]>([]);
  const [recentLimit, setRecentLimit] = useState<number>(10);
  const [ledgerAccountId, setLedgerAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // مودال‌ها
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  // وقتی تراکنش «در انتظار» باز می‌شود، انتخابگر همان طرفِ خالی خودکار باز می‌شود
  const [txPickerTarget, setTxPickerTarget] = useState<"from" | "to" | null>(null);
  const [presetFromAccountId, setPresetFromAccountId] = useState<string | null>(null);
  const [presetToAccountId, setPresetToAccountId] = useState<string | null>(null);

  const [isAccModalOpen, setIsAccModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [newAccInitialType, setNewAccInitialType] = useState<AccountType>("bank");
  const [newAccInitialParentId, setNewAccInitialParentId] = useState<string | null>(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // منوی انتخاب عملیات روی حساب
  const [actionAccount, setActionAccount] = useState<Account | null>(null);

  const [viewMode, setViewMode] = useState<"iphone" | "fluid">("iphone");

  useEffect(() => {
    const savedLimit = parseInt(localStorage.getItem("ios_wallet_recent_limit") || "10", 10);
    if ([5, 10, 15, 20, 30, 50].includes(savedLimit)) setRecentLimit(savedLimit);

    // اعتبارسنجی سشن امن با سرور
    fetch("/api/auth")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setUser(data.user);
          setIsLoggedIn(true);
          localStorage.setItem("ios_wallet_user", JSON.stringify(data.user));
        } else {
          localStorage.removeItem("ios_wallet_user");
          setUser(null);
          setIsLoggedIn(false);
        }
      })
      .catch(() => {
        const savedUser = localStorage.getItem("ios_wallet_user");
        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser));
            setIsLoggedIn(true);
          } catch {
            setIsLoggedIn(false);
          }
        }
      });
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      // فقط تعداد انتخاب‌شده توسط کاربر (۵ تا ۵۰) از تراکنش‌های اخیر خوانده می‌شود
      const [accRes, txRes, pendingRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch(`/api/transactions?limit=${recentLimit}&offset=0`),
        fetch("/api/transactions?limit=50&offset=0&status=pending"),
      ]);
      if (accRes.status === 401 || txRes.status === 401) {
        localStorage.removeItem("ios_wallet_user");
        setUser(null);
        setIsLoggedIn(false);
        return;
      }

      const accData = await accRes.json();
      const txData = await txRes.json();
      const pendingData = await pendingRes.json().catch(() => ({}));

      if (accRes.ok && accData.accounts) setAccounts(accData.accounts);
      if (txRes.ok && txData.transactions) setTransactions(txData.transactions);
      if (pendingRes.ok && pendingData.transactions) setPendingTxs(pendingData.transactions);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Error loading wallet data:", err);
    } finally {
      setLoading(false);
    }
  }, [recentLimit]);

  useEffect(() => {
    if (isLoggedIn) loadData();
  }, [isLoggedIn, loadData]);

  const handleLoginSuccess = (loggedInUser: { id: string; username: string; fullName?: string | null }) => {
    setUser(loggedInUser);
    setIsLoggedIn(true);
    localStorage.setItem("ios_wallet_user", JSON.stringify(loggedInUser));
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {}
    localStorage.removeItem("ios_wallet_user");
    setUser(null);
    setIsLoggedIn(false);
  };

  // تراکنش‌ها
  const handleOpenNewTx = (fromAccountId: string | null = null, toAccountId: string | null = null) => {
    setEditingTx(null);
    setPresetFromAccountId(fromAccountId);
    setPresetToAccountId(toAccountId);
    setIsTxModalOpen(true);
  };

  const handleEditTx = (tx: Transaction) => {
    setEditingTx(tx);
    setTxPickerTarget(null);
    setPresetFromAccountId(null);
    setPresetToAccountId(null);
    setIsTxModalOpen(true);
  };

  /** باز کردن تراکنش «در انتظار ثبت» — انتخابگرِ همان طرفِ خالی مستقیم باز می‌شود */
  const handleOpenPendingTx = (tx: Transaction) => {
    setEditingTx(tx);
    if (tx.fromAccountId === PENDING_INCOME_CATEGORY_ID) setTxPickerTarget("from");
    else if (tx.toAccountId === PENDING_EXPENSE_CATEGORY_ID) setTxPickerTarget("to");
    else setTxPickerTarget(null);
    setPresetFromAccountId(null);
    setPresetToAccountId(null);
    setIsTxModalOpen(true);
  };

  const handleDeleteTx = async (id: string) => {
    try {
      const res = await fetch(`/api/transactions?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "خطا در حذف تراکنش");
        return;
      }
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  // حساب‌ها
  const handleOpenCreateAccount = (type: AccountType = "bank", parentId: string | null = null) => {
    setEditingAccount(null);
    setNewAccInitialType(type);
    setNewAccInitialParentId(parentId);
    setIsAccModalOpen(true);
  };

  const handleOpenEditAccount = (acc: Account) => {
    setEditingAccount(acc);
    setNewAccInitialType(acc.type);
    setNewAccInitialParentId(acc.parentId || null);
    setIsAccModalOpen(true);
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      const res = await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "خطا در حذف حساب");
        return;
      }
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleFavorite = async (acc: Account) => {
    const newFav = !acc.isFavorite;
    setAccounts((prev) => prev.map((a) => (a.id === acc.id ? { ...a, isFavorite: newFav } : a)));
    try {
      const res = await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: acc.id, isFavorite: newFav }),
      });
      if (!res.ok) loadData();
    } catch {
      loadData();
    }
  };

  const handleFilterTransactionsByAccount = (accountId: string) => {
    setLedgerAccountId(accountId);
    setCurrentTab("ledger");
  };

  /** ذخیره ترتیب دلخواه حساب‌های منتخب */
  const handleSaveOrder = async (ids: string[]) => {
    // به‌روزرسانی خوش‌بینانه
    setAccounts((prev) =>
      prev.map((a) => {
        const idx = ids.indexOf(a.id);
        return idx >= 0 ? { ...a, sortOrder: idx + 1 } : a;
      })
    );
    try {
      const res = await fetch("/api/accounts/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
    } catch {
      loadData();
    }
  };

  const handleChangeRecentLimit = (n: number) => {
    setRecentLimit(n);
    localStorage.setItem("ios_wallet_recent_limit", String(n));
  };

  /** باز کردن ویرایش تراکنش از روی شناسه (برای گردش حساب) */
  const handleEditTxById = async (txId: string) => {
    try {
      const res = await fetch(`/api/transactions?limit=1&offset=0&id=${txId}`);
      const data = await res.json();
      const found = (data.transactions || []).find((t: Transaction) => t.id === txId);
      if (found) handleEditTx(found);
    } catch (err) {
      console.error(err);
    }
  };

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-sky-700 via-sky-600 to-cyan-700 flex items-center justify-center p-4">
        <LoginModal isOpen={true} onLoginSuccess={handleLoginSuccess} />
      </main>
    );
  }

  return (
    <main className="h-[100dvh] overflow-hidden bg-[#ecf4f9] text-slate-800 flex flex-col items-center justify-start antialiased">
      {/* نوار سوئیچ نمای دسکتاپ */}
      <div className="w-full hidden md:flex items-center justify-between px-6 py-2 bg-sky-900/10 border-b border-sky-200/50 text-xs text-sky-900">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold">کیف پول هوشمند – متصل به سرور و پایگاه‌داده</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/80 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setViewMode("iphone")}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition ${
              viewMode === "iphone" ? "bg-sky-600 text-white font-bold" : "text-slate-600"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>نمای آیفون</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("fluid")}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition ${
              viewMode === "fluid" ? "bg-sky-600 text-white font-bold" : "text-slate-600"
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>نمای کامل</span>
          </button>
        </div>
      </div>

      <div
        className={`w-full flex-1 min-h-0 transition-all duration-300 ${
          viewMode === "iphone"
            ? "max-w-md md:my-4 rounded-none md:rounded-[42px] shadow-2xl bg-white border-0 md:border-[10px] md:border-slate-800 overflow-hidden ring-1 ring-black/10 flex flex-col relative"
            : "max-w-2xl bg-white shadow-xl overflow-hidden flex flex-col relative"
        }`}
      >
        <TopBar
          onOpenSearch={() => setIsSearchOpen(true)}
          onLockApp={handleLogout}
        />

        <div
          className="flex-1 min-h-0 p-4 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {loading && accounts.length === 0 ? (
            <div className="py-24 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="text-xs text-slate-500 font-semibold">
                در حال بارگذاری اطلاعات کیف پول…
              </div>
            </div>
          ) : (
            <>
              {currentTab === "home" && (
                <ErrorBoundary
                  fallbackTitle="خطایی در نمایش صفحه اصلی رخ داد"
                  onReset={() => loadData()}
                >
                  <HomeTab
                    accounts={accounts}
                    transactions={transactions}
                    pendingTxs={pendingTxs}
                    onSelectPendingTx={handleOpenPendingTx}
                    recentLimit={recentLimit}
                    onChangeRecentLimit={handleChangeRecentLimit}
                    onOpenNewTx={() => handleOpenNewTx()}
                    onAccountAction={(acc) => setActionAccount(acc)}
                    onSaveOrder={handleSaveOrder}
                    onSelectTx={handleEditTx}
                    onSwitchTab={(t) => setCurrentTab(t)}
                  />
                </ErrorBoundary>
              )}

              {currentTab === "ledger" && ledgerAccountId && (
                <ErrorBoundary
                  fallbackTitle="خطایی در نمایش گردش حساب رخ داد"
                  onReset={() => setRefreshKey((k) => k + 1)}
                >
                  <LedgerView
                    account={
                      accounts.find((a) => a.id === ledgerAccountId) || {
                        id: ledgerAccountId,
                        name: "حساب",
                        type: "bank",
                        initialBalance: 0,
                        isFavorite: false,
                        isParent: false,
                      }
                    }
                    allAccounts={accounts}
                    onBack={() => setCurrentTab("home")}
                    onEditTx={handleEditTxById}
                    reloadToken={refreshKey}
                  />
                </ErrorBoundary>
              )}

              {currentTab === "reports" && (
                <ErrorBoundary
                  fallbackTitle="خطایی در محاسبات گزارش‌ها رخ داد"
                  onReset={() => setRefreshKey((k) => k + 1)}
                >
                  <ReportsTab
                    onFilterTransactionsByAccount={handleFilterTransactionsByAccount}
                    refreshKey={refreshKey}
                  />
                </ErrorBoundary>
              )}

              {currentTab === "accounts" && (
                <ErrorBoundary
                  fallbackTitle="خطایی در نمایش لیست حساب‌ها رخ داد"
                  onReset={() => loadData()}
                >
                  <AccountsTab
                    accounts={accounts}
                    onOpenCreateModal={handleOpenCreateAccount}
                    onOpenEditModal={handleOpenEditAccount}
                    onDeleteAccount={handleDeleteAccount}
                    onToggleFavorite={handleToggleFavorite}
                    onFilterTransactions={handleFilterTransactionsByAccount}
                  />
                </ErrorBoundary>
              )}

              {currentTab === "settings" && (
                <ErrorBoundary
                  fallbackTitle="خطایی در بخش تنظیمات رخ داد"
                  onReset={() => loadData()}
                >
                  <SettingsTab
                    user={user}
                    onLogout={handleLogout}
                    onRefreshAllData={loadData}
                    accounts={accounts}
                  />
                </ErrorBoundary>
              )}
            </>
          )}
        </div>

        <BottomTabBar
          currentTab={currentTab}
          onTabChange={(t) => setCurrentTab(t)}
          onOpenNewTx={() => handleOpenNewTx()}
        />
      </div>

      {/* منوی انتخاب عملیات روی حساب منتخب صفحه اصلی */}
      <ActionSheet
        isOpen={actionAccount !== null}
        onClose={() => setActionAccount(null)}
        title={actionAccount?.name || ""}
        subtitle={
          actionAccount
            ? actionAccount.type === "bank"
              ? "حساب بانکی"
              : actionAccount.type === "cash"
              ? "صندوق"
              : actionAccount.type === "person"
              ? "شخص / طرف حساب"
              : actionAccount.type === "expense"
              ? "سرفصل هزینه"
              : "سرفصل درآمد"
            : ""
        }
        items={
          actionAccount
            ? (() => {
                const isAsset = ["bank", "cash", "person"].includes(actionAccount.type);
                const items = [];
                if (isAsset) {
                  items.push(
                    {
                      key: "pay",
                      label: "پرداخت",
                      icon: <ArrowUpRight className="w-4.5 h-4.5" />,
                      tone: "rose" as const,
                      onClick: () => handleOpenNewTx(actionAccount.id, null),
                    },
                    {
                      key: "receive",
                      label: "دریافت",
                      icon: <ArrowDownLeft className="w-4.5 h-4.5" />,
                      tone: "emerald" as const,
                      onClick: () => handleOpenNewTx(null, actionAccount.id),
                    }
                  );
                } else {
                  items.push({
                    key: "new-tx",
                    label: "ثبت تراکنش",
                    icon: <Plus className="w-4.5 h-4.5" />,
                    tone: "sky" as const,
                    onClick: () =>
                      actionAccount.type === "expense"
                        ? handleOpenNewTx(null, actionAccount.id)
                        : handleOpenNewTx(actionAccount.id, null),
                  });
                }
                items.push(
                  {
                    key: "ledger",
                    label: "گردش حساب",
                    icon: <ListOrdered className="w-4.5 h-4.5" />,
                    tone: "sky" as const,
                    onClick: () => handleFilterTransactionsByAccount(actionAccount.id),
                  },
                  {
                    key: "edit",
                    label: "ویرایش حساب",
                    icon: <Edit2 className="w-4.5 h-4.5" />,
                    tone: "slate" as const,
                    onClick: () => handleOpenEditAccount(actionAccount),
                  }
                );
                return items;
              })()
            : []
        }
      />

      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => {
          setIsTxModalOpen(false);
          setTxPickerTarget(null);
        }}
        onSuccess={loadData}
        editTx={editingTx}
        initialPickerTarget={txPickerTarget}
        allAccounts={accounts}
        onRefreshAccounts={loadData}
        presetFromAccountId={presetFromAccountId}
        presetToAccountId={presetToAccountId}
        onDelete={handleDeleteTx}
      />

      <CreateAccountModal
        isOpen={isAccModalOpen}
        onClose={() => setIsAccModalOpen(false)}
        onSuccess={() => loadData()}
        initialType={newAccInitialType}
        initialParentId={newAccInitialParentId}
        editAccount={editingAccount}
        allAccounts={accounts}
      />

      <UnifiedSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        allAccounts={accounts}
        onSelectAccount={(acc) => setActionAccount(acc)}
        onSelectTransaction={(tx) => handleEditTx(tx)}
      />
    </main>
  );
}
