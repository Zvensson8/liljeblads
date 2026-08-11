/**
 * Feature flags for incomplete or environment-dependent product areas,
 * and for aggressive product slim-down (keep code, hide from product UI).
 */
export const featureFlags = {
  /** Backend returns 501 — hide schedule UI until generation is implemented */
  scheduledReports: false,

  /** Requires RESEND_API_KEY + cron; UI for prefs can stay visible */
  emailReminders: true,

  // --- Product slim-down (Fas 1: hide; Fas 3: delete code) ---

  /** Driftuppföljning module (/operations) */
  operationsModule: false,

  /** Global reports page (/reports) — replaced by per-module Exportera XLSX */
  globalReportsPage: false,

  /** Security dashboard (/security) — GDPR tools can live under user settings later */
  securityDashboard: false,

  /** Cost overview page (not in primary nav) */
  costOverviewPage: false,

  /** Floor canvas editor + property drawings tab */
  floorCanvasAndDrawings: false,

  /** Flexible property technical info + info categories */
  propertyInfoCategories: false,

  /** Org admin tabs: capacity, audit log, bulk data export */
  orgAdvancedAdminTabs: false,
} as const;
