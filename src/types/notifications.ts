export interface UserNotificationPreferences {
  id: string;
  user_id: string;
  organization_id: string;
  monthly_project_summary: boolean;
  monthly_workorder_summary: boolean;
  maintenance_reminders: boolean;
  maintenance_history_annual: boolean;
  preferred_day: string;
  notification_email: string | null;
  project_summary_previewed: boolean;
  workorder_summary_previewed: boolean;
  maintenance_reminders_previewed: boolean;
  maintenance_history_previewed: boolean;
  project_summary_frequency: string;
  project_summary_time: string;
  workorder_summary_frequency: string;
  workorder_summary_time: string;
  maintenance_reminders_frequency: string;
  maintenance_reminders_time: string;
  maintenance_history_frequency: string;
  maintenance_history_time: string;
  created_at: string;
  updated_at: string;
}

export type ReportType = 
  | 'project_summary' 
  | 'workorder_summary' 
  | 'maintenance_reminders' 
  | 'maintenance_history';

export interface ReportPreviewRequest {
  reportType: ReportType;
}

export interface ReportPreviewResponse {
  html: string;
  success: boolean;
}
