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
          component_id: string | null
          created_at: string
          id: string
          is_reported: boolean
          object_name: string | null
          registration_number: string | null
          series_id: string | null
          task_id: string
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          id?: string
          is_reported?: boolean
          object_name?: string | null
          registration_number?: string | null
          series_id?: string | null
          task_id: string
        }
        Update: {
          component_id?: string | null
          created_at?: string
          id?: string
          is_reported?: boolean
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
          component_id: string
          cost: number | null
          created_at: string
          id: string
          notes: string | null
          performed_date: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          action_type: string
          component_id: string
          cost?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          performed_date: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          component_id?: string
          cost?: number | null
          created_at?: string
          id?: string
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
      profiles: {
        Row: {
          approved: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_task_status: {
        Args: { planned: number; reported: number }
        Returns: Database["public"]["Enums"]["task_status"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
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
      quarter_type: "Q1" | "Q2" | "Q3" | "Q4"
      task_status: "completed" | "remaining" | "missing"
      user_role: "admin" | "user" | "reader"
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
      quarter_type: ["Q1", "Q2", "Q3", "Q4"],
      task_status: ["completed", "remaining", "missing"],
      user_role: ["admin", "user", "reader"],
    },
  },
} as const
