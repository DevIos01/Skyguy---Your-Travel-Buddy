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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      favorite_hotels: {
        Row: {
          created_at: string
          hotel_id: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          hotel_id: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          hotel_id?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_hotels_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_availability: {
        Row: {
          created_at: string
          date: string
          hotel_id: string
          id: string
          price_per_night: number
          rooms_available: number
        }
        Insert: {
          created_at?: string
          date: string
          hotel_id: string
          id?: string
          price_per_night: number
          rooms_available?: number
        }
        Update: {
          created_at?: string
          date?: string
          hotel_id?: string
          id?: string
          price_per_night?: number
          rooms_available?: number
        }
        Relationships: [
          {
            foreignKeyName: "hotel_availability_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotels: {
        Row: {
          amenities: string[]
          area: string | null
          base_price_per_night: number
          brand: string
          city: string
          country: string
          created_at: string
          currency: string
          description: string | null
          id: string
          image_url: string | null
          latitude: number | null
          longitude: number | null
          name: string
          rating: number
          reviews_count: number
          stars: number
          updated_at: string
        }
        Insert: {
          amenities?: string[]
          area?: string | null
          base_price_per_night: number
          brand?: string
          city: string
          country: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          rating: number
          reviews_count?: number
          stars: number
          updated_at?: string
        }
        Update: {
          amenities?: string[]
          area?: string | null
          base_price_per_night?: number
          brand?: string
          city?: string
          country?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          rating?: number
          reviews_count?: number
          stars?: number
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          name: string | null
          results: Json | null
          role: string
          tool_call_id: string | null
          tool_calls: Json | null
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          name?: string | null
          results?: Json | null
          role: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          name?: string | null
          results?: Json | null
          role?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ask_before_using_home_address: boolean
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          email: string | null
          full_name: string | null
          home_city: string | null
          home_country: string | null
          home_postal_code: string | null
          home_street: string | null
          id: string
          passport_country: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          ask_before_using_home_address?: boolean
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          home_city?: string | null
          home_country?: string | null
          home_postal_code?: string | null
          home_street?: string | null
          id: string
          passport_country?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          ask_before_using_home_address?: boolean
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          home_city?: string | null
          home_country?: string | null
          home_postal_code?: string | null
          home_street?: string | null
          id?: string
          passport_country?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rental_car_availability: {
        Row: {
          car_id: string
          created_at: string
          date: string
          id: string
          price_per_day: number
          units_available: number
        }
        Insert: {
          car_id: string
          created_at?: string
          date: string
          id?: string
          price_per_day: number
          units_available?: number
        }
        Update: {
          car_id?: string
          created_at?: string
          date?: string
          id?: string
          price_per_day?: number
          units_available?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_car_availability_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "rental_cars"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_cars: {
        Row: {
          bags: number
          base_price_per_day: number
          brand: string
          created_at: string
          currency: string
          doors: number
          features: string[]
          id: string
          image_url: string | null
          latitude: number | null
          longitude: number | null
          name: string
          pickup_city: string
          pickup_country: string
          pickup_location_name: string
          seats: number
          supplier: string
          supplier_rating: number
          transmission: string
          updated_at: string
          vehicle_class: string
        }
        Insert: {
          bags: number
          base_price_per_day: number
          brand?: string
          created_at?: string
          currency?: string
          doors: number
          features?: string[]
          id?: string
          image_url?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          pickup_city: string
          pickup_country: string
          pickup_location_name: string
          seats: number
          supplier: string
          supplier_rating: number
          transmission: string
          updated_at?: string
          vehicle_class: string
        }
        Update: {
          bags?: number
          base_price_per_day?: number
          brand?: string
          created_at?: string
          currency?: string
          doors?: number
          features?: string[]
          id?: string
          image_url?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          pickup_city?: string
          pickup_country?: string
          pickup_location_name?: string
          seats?: number
          supplier?: string
          supplier_rating?: number
          transmission?: string
          updated_at?: string
          vehicle_class?: string
        }
        Relationships: []
      }
      user_travel_preferences: {
        Row: {
          avoided_airlines: string[]
          baggage_preference: string | null
          budget_level: string | null
          checked_bags: number
          created_at: string
          default_adults: number
          default_children: number
          default_rooms: number
          direct_flights_only: boolean
          home_city: string | null
          max_carry_on_weight_kg: number | null
          max_stops: number | null
          min_car_seats: number | null
          min_hotel_rating: number | null
          min_hotel_stars: number | null
          notes: string | null
          prefer_no_long_layovers: boolean
          preferred_airlines: string[]
          preferred_cabin_class: string | null
          preferred_car_class: string | null
          preferred_car_transmission: string | null
          preferred_currency: string
          preferred_hotel_amenities: string[]
          preferred_hotel_brands: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          avoided_airlines?: string[]
          baggage_preference?: string | null
          budget_level?: string | null
          checked_bags?: number
          created_at?: string
          default_adults?: number
          default_children?: number
          default_rooms?: number
          direct_flights_only?: boolean
          home_city?: string | null
          max_carry_on_weight_kg?: number | null
          max_stops?: number | null
          min_car_seats?: number | null
          min_hotel_rating?: number | null
          min_hotel_stars?: number | null
          notes?: string | null
          prefer_no_long_layovers?: boolean
          preferred_airlines?: string[]
          preferred_cabin_class?: string | null
          preferred_car_class?: string | null
          preferred_car_transmission?: string | null
          preferred_currency?: string
          preferred_hotel_amenities?: string[]
          preferred_hotel_brands?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          avoided_airlines?: string[]
          baggage_preference?: string | null
          budget_level?: string | null
          checked_bags?: number
          created_at?: string
          default_adults?: number
          default_children?: number
          default_rooms?: number
          direct_flights_only?: boolean
          home_city?: string | null
          max_carry_on_weight_kg?: number | null
          max_stops?: number | null
          min_car_seats?: number | null
          min_hotel_rating?: number | null
          min_hotel_stars?: number | null
          notes?: string | null
          prefer_no_long_layovers?: boolean
          preferred_airlines?: string[]
          preferred_cabin_class?: string | null
          preferred_car_class?: string | null
          preferred_car_transmission?: string | null
          preferred_currency?: string
          preferred_hotel_amenities?: string[]
          preferred_hotel_brands?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
