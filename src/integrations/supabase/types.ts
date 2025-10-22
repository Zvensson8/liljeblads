export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      component_documents: {
        Row: {
          component_id: string
          created_at: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          name: string
        }
        Insert: {
          component_id: string
          created_at?: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          name: string
        }
        Update: {
          component_id?: string
          created_at?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "component_documents_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
        ]
      }
      component_geometry: {
        Row: {
          component_id: string
          created_at: string
          id: string
          x: number
          y: number
        }
        Insert: {
          component_id: string
          created_at?: string
          id?: string
          x: number
          y: number
        }
        Update: {
          component_id?: string
          created_at?: string
          id?: string
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "component_geometry_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
        ]
      }
      component_purchase_info: {
        Row: {
          component_id: string
          created_at: string
          expected_lifespan_years: number | null
          id: string
          purchase_cost: number | null
          purchase_date: string | null
          updated_at: string
          warranty_years: number | null
        }
        Insert: {
          component_id: string
          created_at?: string
          expected_lifespan_years?: number | null
          id?: string
          purchase_cost?: number | null
          purchase_date?: string | null
          updated_at?: string
          warranty_years?: number | null
        }
        Update: {
          component_id?: string
          created_at?: string
          expected_lifespan_years?: number | null
          id?: string
          purchase_cost?: number | null
          purchase_date?: string | null
          updated_at?: string
          warranty_years?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "component_purchase_info_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: true
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
        ]
      }
      component_service_plans: {
        Row: {
          category_id: string
          component_id: string
          created_at: string
          id: string
          is_active: boolean
          quarters: string[]
          updated_at: string
        }
        Insert: {
          category_id: string
          component_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          quarters?: string[]
          updated_at?: string
        }
        Update: {
          category_id?: string
          component_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          quarters?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "component_service_plans_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "drift_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_service_plans_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
        ]
      }
      components: {
        Row: {
          aff_code: string | null
          cost_center: string | null
          created_at: string
          floor_id: string
          id: string
          installation_year: number | null
          manufacturer: string | null
          model: string | null
          name: string
          next_service_date: string | null
          notes: string | null
          priority: number | null
          refrigerant_amount_kg: number | null
          refrigerant_code: string | null
          refrigerant_type: string | null
          registration_number: string | null
          room_zone: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["component_status"]
          supplier: string | null
          type: Database["public"]["Enums"]["component_type"]
          updated_at: string
        }
        Insert: {
          aff_code?: string | null
          cost_center?: string | null
          created_at?: string
          floor_id: string
          id?: string
          installation_year?: number | null
          manufacturer?: string | null
          model?: string | null
          name: string
          next_service_date?: string | null
          notes?: string | null
          priority?: number | null
          refrigerant_amount_kg?: number | null
          refrigerant_code?: string | null
          refrigerant_type?: string | null
          registration_number?: string | null
          room_zone?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["component_status"]
          supplier?: string | null
          type?: Database["public"]["Enums"]["component_type"]
          updated_at?: string
        }
        Update: {
          aff_code?: string | null
          cost_center?: string | null
          created_at?: string
          floor_id?: string
          id?: string
          installation_year?: number | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          next_service_date?: string | null
          notes?: string | null
          priority?: number | null
          refrigerant_amount_kg?: number | null
          refrigerant_code?: string | null
          refrigerant_type?: string | null
          registration_number?: string | null
          room_zone?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["component_status"]
          supplier?: string | null
          type?: Database["public"]["Enums"]["component_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "components_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_active: boolean
          notification_method: string
          threshold_value: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          notification_method?: string
          threshold_value?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          notification_method?: string
          threshold_value?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cost_budgets: {
        Row: {
          alert_threshold_100: boolean
          alert_threshold_75: boolean
          alert_threshold_90: boolean
          budgeted_amount: number
          component_id: string | null
          created_at: string
          id: string
          property_id: string | null
          quarter: string | null
          updated_at: string
          year: number
        }
        Insert: {
          alert_threshold_100?: boolean
          alert_threshold_75?: boolean
          alert_threshold_90?: boolean
          budgeted_amount: number
          component_id?: string | null
          created_at?: string
          id?: string
          property_id?: string | null
          quarter?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          alert_threshold_100?: boolean
          alert_threshold_75?: boolean
          alert_threshold_90?: boolean
          budgeted_amount?: number
          component_id?: string | null
          created_at?: string
          id?: string
          property_id?: string | null
          quarter?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "cost_budgets_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_budgets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      drift_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          property_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          property_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drift_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "drift_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drift_categories_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      drift_task_components: {
        Row: {
          auto_detected_from: string | null
          component_id: string | null
          created_at: string
          id: string
          is_reported: boolean
          manually_edited: boolean | null
          object_name: string | null
          registration_number: string | null
          series_id: string | null
          task_id: string
        }
        Insert: {
          auto_detected_from?: string | null
          component_id?: string | null
          created_at?: string
          id?: string
          is_reported?: boolean
          manually_edited?: boolean | null
          object_name?: string | null
          registration_number?: string | null
          series_id?: string | null
          task_id: string
        }
        Update: {
          auto_detected_from?: string | null
          component_id?: string | null
          created_at?: string
          id?: string
          is_reported?: boolean
          manually_edited?: boolean | null
          object_name?: string | null
          registration_number?: string | null
          series_id?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drift_task_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drift_task_components_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "drift_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      drift_task_templates: {
        Row: {
          category_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          planned_count: number | null
          quarters: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          planned_count?: number | null
          quarters?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          planned_count?: number | null
          quarters?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drift_task_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "drift_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      drift_tasks: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          planned_count: number
          property_id: string
          quarter: Database["public"]["Enums"]["quarter_type"]
          reported_count: number
          updated_at: string
          year: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          planned_count?: number
          property_id: string
          quarter: Database["public"]["Enums"]["quarter_type"]
          reported_count?: number
          updated_at?: string
          year: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          planned_count?: number
          property_id?: string
          quarter?: Database["public"]["Enums"]["quarter_type"]
          reported_count?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "drift_tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "drift_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drift_tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      floors: {
        Row: {
          created_at: string
          drawing_url: string | null
          id: string
          level: number | null
          name: string
          property_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          drawing_url?: string | null
          id?: string
          level?: number | null
          name: string
          property_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          drawing_url?: string | null
          id?: string
          level?: number | null
          name?: string
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floors_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_history: {
        Row: {
          action_type: string
          category: string | null
          component_id: string
          cost: number | null
          created_at: string
          expected_cost: number | null
          id: string
          is_warranty: boolean | null
          notes: string | null
          performed_date: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          action_type: string
          category?: string | null
          component_id: string
          cost?: number | null
          created_at?: string
          expected_cost?: number | null
          id?: string
          is_warranty?: boolean | null
          notes?: string | null
          performed_date: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          category?: string | null
          component_id?: string
          cost?: number | null
          created_at?: string
          expected_cost?: number | null
          id?: string
          is_warranty?: boolean | null
          notes?: string | null
          performed_date?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_history_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          id: string
          joined_at: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_contact: string | null
          billing_cycle: string | null
          created_at: string
          id: string
          invoice_email: string | null
          last_payment_date: string | null
          logo_url: string | null
          max_properties: number
          max_users: number
          name: string
          next_billing_date: string | null
          notes: string | null
          payment_status: string | null
          primary_color: string | null
          subscription_tier: string
          updated_at: string
        }
        Insert: {
          billing_contact?: string | null
          billing_cycle?: string | null
          created_at?: string
          id?: string
          invoice_email?: string | null
          last_payment_date?: string | null
          logo_url?: string | null
          max_properties?: number
          max_users?: number
          name: string
          next_billing_date?: string | null
          notes?: string | null
          payment_status?: string | null
          primary_color?: string | null
          subscription_tier?: string
          updated_at?: string
        }
        Update: {
          billing_contact?: string | null
          billing_cycle?: string | null
          created_at?: string
          id?: string
          invoice_email?: string | null
          last_payment_date?: string | null
          logo_url?: string | null
          max_properties?: number
          max_users?: number
          name?: string
          next_billing_date?: string | null
          notes?: string | null
          payment_status?: string | null
          primary_color?: string | null
          subscription_tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activity_log: {
        Row: {
          activity_type: string
          created_at: string | null
          created_by: string | null
          description: string
          id: string
          metadata: Json | null
          project_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          created_by?: string | null
          description: string
          id?: string
          metadata?: Json | null
          project_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          id?: string
          metadata?: Json | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_budget_items: {
        Row: {
          budgeted_amount: number
          category: string | null
          created_at: string | null
          description: string
          forecasted_amount: number | null
          id: string
          project_id: string
        }
        Insert: {
          budgeted_amount: number
          category?: string | null
          created_at?: string | null
          description: string
          forecasted_amount?: number | null
          id?: string
          project_id: string
        }
        Update: {
          budgeted_amount?: number
          category?: string | null
          created_at?: string | null
          description?: string
          forecasted_amount?: number | null
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_budget_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_checklist_items: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          deadline: string | null
          description: string | null
          id: string
          order_index: number | null
          project_id: string
          responsible: string | null
          title: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          order_index?: number | null
          project_id: string
          responsible?: string | null
          title: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          order_index?: number | null
          project_id?: string
          responsible?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_checklist_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_checklist_templates: {
        Row: {
          created_at: string | null
          id: string
          items: Json
          name: string
          project_type: Database["public"]["Enums"]["project_type"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          items: Json
          name: string
          project_type: Database["public"]["Enums"]["project_type"]
        }
        Update: {
          created_at?: string | null
          id?: string
          items?: Json
          name?: string
          project_type?: Database["public"]["Enums"]["project_type"]
        }
        Relationships: []
      }
      project_cost_items: {
        Row: {
          actor: string | null
          amount: number
          category: string | null
          cost_date: string
          created_at: string | null
          created_by: string | null
          description: string
          id: string
          project_id: string
        }
        Insert: {
          actor?: string | null
          amount: number
          category?: string | null
          cost_date: string
          created_at?: string | null
          created_by?: string | null
          description: string
          id?: string
          project_id: string
        }
        Update: {
          actor?: string | null
          amount?: number
          category?: string | null
          cost_date?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_document_comments: {
        Row: {
          comment: string
          created_at: string | null
          created_by: string | null
          document_id: string
          id: string
        }
        Insert: {
          comment: string
          created_at?: string | null
          created_by?: string | null
          document_id: string
          id?: string
        }
        Update: {
          comment?: string
          created_at?: string | null
          created_by?: string | null
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_document_comments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          created_at: string | null
          file_size: number | null
          file_url: string
          folder: string | null
          id: string
          mime_type: string | null
          name: string
          project_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_size?: number | null
          file_url: string
          folder?: string | null
          id?: string
          mime_type?: string | null
          name: string
          project_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_size?: number | null
          file_url?: string
          folder?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          project_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_notes: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          project_id: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actors: string[] | null
          actual_cost: number | null
          budget: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          forecast: number | null
          id: string
          is_archived: boolean | null
          name: string
          project_manager: string | null
          project_number: string
          property_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          type: Database["public"]["Enums"]["project_type"]
          updated_at: string | null
        }
        Insert: {
          actors?: string[] | null
          actual_cost?: number | null
          budget?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          forecast?: number | null
          id?: string
          is_archived?: boolean | null
          name: string
          project_manager?: string | null
          project_number: string
          property_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          type: Database["public"]["Enums"]["project_type"]
          updated_at?: string | null
        }
        Update: {
          actors?: string[] | null
          actual_cost?: number | null
          budget?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          forecast?: number | null
          id?: string
          is_archived?: boolean | null
          name?: string
          project_manager?: string | null
          project_number?: string
          property_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          type?: Database["public"]["Enums"]["project_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          area_sqm: number | null
          construction_year: number | null
          created_at: string
          description: string | null
          id: string
          invoice_address: string | null
          loa: string | null
          name: string
          organization_id: string | null
          owner_id: string
          property_number: string | null
          property_type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          area_sqm?: number | null
          construction_year?: number | null
          created_at?: string
          description?: string | null
          id?: string
          invoice_address?: string | null
          loa?: string | null
          name: string
          organization_id?: string | null
          owner_id: string
          property_number?: string | null
          property_type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          area_sqm?: number | null
          construction_year?: number | null
          created_at?: string
          description?: string | null
          id?: string
          invoice_address?: string | null
          loa?: string | null
          name?: string
          organization_id?: string | null
          owner_id?: string
          property_number?: string | null
          property_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_contacts: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          property_id: string
          role: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          property_id: string
          role?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          property_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_contacts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_documents: {
        Row: {
          created_at: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          name: string
          property_id: string
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          name: string
          property_id: string
        }
        Update: {
          created_at?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          name?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          property_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          property_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_notes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_recurring_costs: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          frequency: string
          id: string
          next_due_date: string | null
          property_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description: string
          frequency: string
          id?: string
          next_due_date?: string | null
          property_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          frequency?: string
          id?: string
          next_due_date?: string | null
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_recurring_costs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_todos: {
        Row: {
          completed: boolean
          created_at: string
          due_date: string | null
          id: string
          property_id: string
          title: string
          updated_at: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          due_date?: string | null
          id?: string
          property_id: string
          title: string
          updated_at?: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          due_date?: string | null
          id?: string
          property_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_todos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_users: {
        Row: {
          created_at: string
          id: string
          property_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          property_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_users_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_order_files: {
        Row: {
          created_at: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          name: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          name: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          name?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_files_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          action: string
          comments: string | null
          contractor: string | null
          created_at: string
          due_date: string | null
          id: string
          price: number | null
          priority: Database["public"]["Enums"]["work_order_priority"]
          property_id: string
          quarter: string | null
          status: Database["public"]["Enums"]["work_order_status"]
          updated_at: string
        }
        Insert: {
          action: string
          comments?: string | null
          contractor?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          price?: number | null
          priority?: Database["public"]["Enums"]["work_order_priority"]
          property_id: string
          quarter?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          updated_at?: string
        }
        Update: {
          action?: string
          comments?: string | null
          contractor?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          price?: number | null
          priority?: Database["public"]["Enums"]["work_order_priority"]
          property_id?: string
          quarter?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_task_status: {
        Args: { planned: number; reported: number }
        Returns: Database["public"]["Enums"]["task_status"]
      }
      get_user_organization_id: {
        Args: { _user_id: string }
        Returns: string
      }
      has_organization_role: {
        Args: { _org_id: string; _role: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_organization_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      component_status:
        | "active"
        | "inactive"
        | "maintenance"
        | "needs_repair"
        | "decommissioned"
      component_type:
        | "SC1"
        | "SC2.1.1"
        | "SC2.3"
        | "SC2.3.1"
        | "SC2.3.3"
        | "SC2.3.4"
        | "SC2.3.7"
        | "SC2.6.2"
        | "SC4.1.2.5.1"
        | "SC4.1.2.5.3"
        | "SC4.1.6.9"
        | "SC4.2.4.6"
        | "SC4.2.4.7"
        | "SC4.5.1"
        | "SC4.6.2.6"
        | "SC4.6.2.6.1"
        | "SC4.7"
        | "SC5.5"
        | "SC7.1"
        | "SC7.2"
      project_status:
        | "planerat"
        | "invantar_offert"
        | "offert_finns"
        | "pagaende"
        | "pausat"
        | "avslutat"
      project_type: "investering" | "underhall" | "energi" | "annat"
      quarter_type: "Q1" | "Q2" | "Q3" | "Q4"
      task_status: "completed" | "remaining" | "missing"
      user_role: "admin" | "user" | "reader"
      work_order_priority: "low" | "medium" | "high"
      work_order_status:
        | "not_started"
        | "awaiting_quote"
        | "ordered"
        | "completed"
        | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      component_status: [
        "active",
        "inactive",
        "maintenance",
        "needs_repair",
        "decommissioned",
      ],
      component_type: [
        "SC1",
        "SC2.1.1",
        "SC2.3",
        "SC2.3.1",
        "SC2.3.3",
        "SC2.3.4",
        "SC2.3.7",
        "SC2.6.2",
        "SC4.1.2.5.1",
        "SC4.1.2.5.3",
        "SC4.1.6.9",
        "SC4.2.4.6",
        "SC4.2.4.7",
        "SC4.5.1",
        "SC4.6.2.6",
        "SC4.6.2.6.1",
        "SC4.7",
        "SC5.5",
        "SC7.1",
        "SC7.2",
      ],
      project_status: [
        "planerat",
        "invantar_offert",
        "offert_finns",
        "pagaende",
        "pausat",
        "avslutat",
      ],
      project_type: ["investering", "underhall", "energi", "annat"],
      quarter_type: ["Q1", "Q2", "Q3", "Q4"],
      task_status: ["completed", "remaining", "missing"],
      user_role: ["admin", "user", "reader"],
      work_order_priority: ["low", "medium", "high"],
      work_order_status: [
        "not_started",
        "awaiting_quote",
        "ordered",
        "completed",
        "archived",
      ],
    },
  },
} as const
