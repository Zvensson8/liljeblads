/**
 * Feature flags for incomplete or environment-dependent product areas.
 * Toggle here rather than shipping half-working UI.
 */
export const featureFlags = {
  /** Backend returns 501 — hide schedule UI until generation is implemented */
  scheduledReports: false,

  /** Requires RESEND_API_KEY + cron; UI for prefs can stay visible */
  emailReminders: true,
} as const;
