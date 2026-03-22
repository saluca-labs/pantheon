"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardProvider, useDashboard } from "@/components/dashboard/DashboardProvider";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import LayoutPresets from "@/components/dashboard/LayoutPresets";
import WidgetPalette from "@/components/dashboard/WidgetPalette";
import { useAuth } from "@/lib/auth";

function DashboardContent() {
  const { isEditMode, toggleEditMode } = useDashboard();
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // Check cookie flag set by welcome page on first visit
    const hasVisitedWelcome =
      typeof document !== "undefined" &&
      document.cookie.includes("tiresias_welcomed=1");
    // If session exists and flag not set, redirect to welcome
    if (session && !hasVisitedWelcome) {
      router.push("/dashboard/welcome");
    }
  }, [session, loading, router]);

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            {isEditMode ? "Drag widgets to rearrange, resize, or remove them" : "Your operational overview"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Edit mode toggle */}
          <button
            onClick={toggleEditMode}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200
              ${isEditMode
                ? "border-gold-500/30 bg-gold-500/10 text-gold-400 shadow-lg shadow-gold-500/5"
                : "border-white/10 bg-white/5 text-foreground-muted hover:text-foreground hover:bg-white/10"
              }
            `}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            {isEditMode ? "Done Editing" : "Edit Layout"}
          </button>

          {/* Add widget (edit mode only) */}
          {isEditMode && <WidgetPalette />}
        </div>
      </div>

      {/* Layout presets */}
      <LayoutPresets />

      {/* Edit mode banner */}
      {isEditMode && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gold-500/20 bg-gold-500/5 text-gold-400 text-xs">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <span>Edit mode active — drag handles appear on each widget. Click size (S/M/L) to resize, X to remove.</span>
        </div>
      )}

      {/* Dashboard grid */}
      <DashboardGrid />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <DashboardProvider>
      <DashboardContent />
    </DashboardProvider>
  );
}
