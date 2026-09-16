"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 my-4 bg-rose-50/70 border border-rose-200/80 rounded-2xl text-center space-y-3">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            {this.props.fallbackTitle || "خطایی در نمایش این بخش رخ داده است"}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
            {this.props.fallbackMessage ||
              "داده‌های این بخش با مشکلی مواجه شدند، اما سایر بخش‌های کیف پول فعال هستند."}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>تلاش مجدد</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
