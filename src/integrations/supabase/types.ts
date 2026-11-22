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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string
          entity_id: string | null
          id: number
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name_ar: string
          name_en: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
          sort_order?: number
        }
        Relationships: []
      }
      customer_ledger: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          entry_date: string
          id: string
          kind: string
          note: string | null
          payment_id: string | null
          sale_id: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          entry_date: string
          id?: string
          kind: string
          note?: string | null
          payment_id?: string | null
          sale_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          entry_date?: string
          id?: string
          kind?: string
          note?: string | null
          payment_id?: string | null
          sale_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "customer_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payment_allocations: {
        Row: {
          amount: number
          id: string
          payment_id: string
          sale_id: string
        }
        Insert: {
          amount: number
          id?: string
          payment_id: string
          sale_id: string
        }
        Update: {
          amount?: number
          id?: string
          payment_id?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "customer_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_allocations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          cashier_id: string
          cashier_name: string | null
          created_at: string
          customer_id: string
          id: string
          idempotency_key: string
          method: string
          notes: string | null
          paid_on: string
          proof_path: string | null
          receipt_no: string
          reference: string | null
          reverse_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
        }
        Insert: {
          amount: number
          cashier_id: string
          cashier_name?: string | null
          created_at?: string
          customer_id: string
          id?: string
          idempotency_key: string
          method: string
          notes?: string | null
          paid_on: string
          proof_path?: string | null
          receipt_no: string
          reference?: string | null
          reverse_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Update: {
          amount?: number
          cashier_id?: string
          cashier_name?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          idempotency_key?: string
          method?: string
          notes?: string | null
          paid_on?: string
          proof_path?: string | null
          receipt_no?: string
          reference?: string | null
          reverse_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          credit_enabled: boolean
          credit_limit: number
          deleted_at: string | null
          id: string
          loyalty_points: number
          loyalty_points_last_date: string | null
          name: string
          notes: string | null
          opening_balance: number
          payment_terms_days: number
          phone: string | null
          phone2: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          credit_enabled?: boolean
          credit_limit?: number
          deleted_at?: string | null
          id?: string
          loyalty_points?: number
          name: string
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          phone2?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          credit_enabled?: boolean
          credit_limit?: number
          deleted_at?: string | null
          id?: string
          loyalty_points?: number
          name?: string
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          phone2?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      daily_counts: {
        Row: {
          business_date: string
          closed_at: string | null
          closing: number | null
          discrepancy: number | null
          expected_at_close: number | null
          id: string
          opening: number
          product_id: string
          user_id: string
        }
        Insert: {
          business_date: string
          closed_at?: string | null
          closing?: number | null
          discrepancy?: number | null
          expected_at_close?: number | null
          id?: string
          opening: number
          product_id: string
          user_id: string
        }
        Update: {
          business_date?: string
          closed_at?: string | null
          closing?: number | null
          discrepancy?: number | null
          expected_at_close?: number | null
          id?: string
          opening?: number
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_counts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          proof_path: string | null
          reference: string | null
          sale_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: string
          proof_path?: string | null
          reference?: string | null
          sale_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          proof_path?: string | null
          reference?: string | null
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string
          cost: number
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_url: string | null
          name_ar: string
          name_en: string
          price: number
          sku: string | null
          stock_qty: number
          track_stock: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id: string
          cost?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name_ar: string
          name_en: string
          price: number
          sku?: string | null
          stock_qty?: number
          track_stock?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string
          cost?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name_ar?: string
          name_en?: string
          price?: number
          sku?: string | null
          stock_qty?: number
          track_stock?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          full_name: string
          id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          category_id: string
          discount: number
          id: string
          image_url: string | null
          line_total: number
          list_price: number
          name_ar: string
          name_en: string
          product_id: string
          qty: number
          sale_id: string
          stock_deducted: number
          unit_cost: number
          unit_price: number
        }
        Insert: {
          category_id: string
          discount?: number
          id?: string
          image_url?: string | null
          line_total: number
          list_price: number
          name_ar: string
          name_en: string
          product_id: string
          qty: number
          sale_id: string
          stock_deducted?: number
          unit_cost?: number
          unit_price: number
        }
        Update: {
          category_id?: string
          discount?: number
          id?: string
          image_url?: string | null
          line_total?: number
          list_price?: number
          name_ar?: string
          name_en?: string
          product_id?: string
          qty?: number
          sale_id?: string
          stock_deducted?: number
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_due: number
          amount_settled: number
          cashier_id: string
          cashier_name: string | null
          change_due: number
          created_at: string
          customer_id: string | null
          customer_phone: string | null
          delivery_address: string | null
          delivery_fee: number
          discount: number
          due_date: string | null
          id: string
          idempotency_key: string
          invoice_no: string
          notes: string | null
          order_type: string
          paid: number
          refund_reason: string | null
          refunded_at: string | null
          refunded_by: string | null
          status: string
          subtotal: number
          tax: number
          total: number
        }
        Insert: {
          amount_due?: number
          amount_settled?: number
          cashier_id: string
          cashier_name?: string | null
          change_due?: number
          created_at?: string
          customer_id?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          discount?: number
          due_date?: string | null
          id?: string
          idempotency_key: string
          invoice_no: string
          notes?: string | null
          order_type?: string
          paid: number
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          status?: string
          subtotal: number
          tax?: number
          total: number
        }
        Update: {
          amount_due?: number
          amount_settled?: number
          cashier_id?: string
          cashier_name?: string | null
          change_due?: number
          created_at?: string
          customer_id?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          discount?: number
          due_date?: string | null
          id?: string
          idempotency_key?: string
          invoice_no?: string
          notes?: string | null
          order_type?: string
          paid?: number
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          address: string | null
          currency_code: string
          currency_decimals: number
          currency_symbol_ar: string
          currency_symbol_en: string
          date_format: string
          delivery_enabled: boolean
          delivery_fee: number
          delivery_taxable: boolean
          id: number
          instagram: string | null
          logo_url: string | null
          payment_methods: Json
          phone: string | null
          receipt_footer: string | null
          slogan: string
          store_name: string
          tax_enabled: boolean
          tax_rate: number
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          currency_code?: string
          currency_decimals?: number
          currency_symbol_ar?: string
          currency_symbol_en?: string
          date_format?: string
          delivery_enabled?: boolean
          delivery_fee?: number
          delivery_taxable?: boolean
          id?: number
          instagram?: string | null
          logo_url?: string | null
          payment_methods?: Json
          phone?: string | null
          receipt_footer?: string | null
          slogan?: string
          store_name?: string
          tax_enabled?: boolean
          tax_rate?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          currency_code?: string
          currency_decimals?: number
          currency_symbol_ar?: string
          currency_symbol_en?: string
          date_format?: string
          delivery_enabled?: boolean
          delivery_fee?: number
          delivery_taxable?: boolean
          id?: number
          instagram?: string | null
          logo_url?: string | null
          payment_methods?: Json
          phone?: string | null
          receipt_footer?: string | null
          slogan?: string
          store_name?: string
          tax_enabled?: boolean
          tax_rate?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          business_date: string
          created_at: string
          id: string
          kind: string
          product_id: string
          quantity: number
          reason: string | null
          sale_id: string | null
          user_id: string | null
        }
        Insert: {
          business_date: string
          created_at?: string
          id?: string
          kind: string
          product_id: string
          quantity: number
          reason?: string | null
          sale_id?: string | null
          user_id?: string | null
        }
        Update: {
          business_date?: string
          created_at?: string
          id?: string
          kind?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          sale_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      customer_balances: {
        Row: {
          balance: number | null
          customer_id: string | null
          oldest_due: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      business_today: { Args: never; Returns: string }
      complete_counter_sale: {
        Args: {
          p_credit_override_reason?: string
          p_customer_id?: string
          p_customer_phone?: string
          p_delivery_address?: string
          p_idempotency_key: string
          p_items: Json
          p_notes?: string
          p_order_discount?: number
          p_order_type?: string
          p_payments: Json
        }
        Returns: Json
      }
      dashboard_stats: { Args: { p_from: string; p_to: string }; Returns: Json }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      manage_daily_stock: {
        Args: {
          p_action: string
          p_product_id: string
          p_quantity: number
          p_reason?: string
        }
        Returns: undefined
      }
      receive_customer_payment: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_idempotency_key: string
          p_method: string
          p_notes?: string
          p_proof_path?: string
          p_reference?: string
          p_sale_ids?: string[]
        }
        Returns: Json
      }
      reverse_counter_sale: {
        Args: {
          p_reason: string
          p_restock?: boolean
          p_sale_id: string
          p_status?: string
        }
        Returns: undefined
      }
      reverse_customer_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
      sign_out: { Args: never; Returns: undefined }
      authenticate_user: {
        Args: { p_email: string; p_password: string }
        Returns: Json
      }
      whoami: { Args: never; Returns: Json }
      request_password_reset: { Args: { p_email: string }; Returns: Json }
      reset_password_with_token: {
        Args: { p_new_password: string; p_token: string }
        Returns: Json
      }
      change_password: {
        Args: { p_new_password: string; p_old_password: string }
        Returns: Json
      }
      list_users: { Args: never; Returns: { id: string; email: string; full_name: string; role: Database["public"]["Enums"]["app_role"]; active: boolean; created_at: string }[] }
      create_user: {
        Args: { p_active: boolean; p_email: string; p_full_name: string; p_password: string; p_role: Database["public"]["Enums"]["app_role"] }
        Returns: Json
      }
      update_user: {
        Args: { p_active: boolean | null; p_full_name: string | null; p_role: Database["public"]["Enums"]["app_role"] | null; p_role_set: boolean; p_user_id: string }
        Returns: Json
      }
      reset_user_password: { Args: { p_user_id: string }; Returns: string }
      customer_overdue: { Args: { p_customer_id: string }; Returns: boolean }
      customer_statement: {
        Args: { p_customer_id: string; p_from: string; p_to: string }
        Returns: Json[]
      }
      receivables_aging: { Args: never; Returns: Json[] }
      collections_report: {
        Args: { p_from: string; p_to: string }
        Returns: Json[]
      }
      spend_loyalty_points: {
        Args: { p_amount: number; p_customer_id: string; p_reason?: string }
        Returns: Json
      }
      update_loyalty_points_from_sales: { Args: { p_days: number }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "manager" | "cashier" | "accountant"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "manager", "cashier", "accountant"],
    },
  },
} as const
