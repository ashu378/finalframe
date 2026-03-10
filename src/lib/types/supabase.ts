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
        PostgrestVersion: "14.1"
    }
    public: {
        Tables: {
            creative_dna: {
                Row: {
                    brand_energy: string
                    created_at: string | null
                    editing_pace: string
                    id: string
                    music_energy: string
                    studio_id: string
                    text_personality: string
                    updated_at: string | null
                    visual_style: string
                }
                Insert: {
                    brand_energy: string
                    created_at?: string | null
                    editing_pace: string
                    id?: string
                    music_energy: string
                    studio_id: string
                    text_personality: string
                    updated_at?: string | null
                    visual_style: string
                }
                Update: {
                    brand_energy?: string
                    created_at?: string | null
                    editing_pace?: string
                    id?: string
                    music_energy?: string
                    studio_id?: string
                    text_personality?: string
                    updated_at?: string | null
                    visual_style?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "creative_dna_studio_id_fkey"
                        columns: ["studio_id"]
                        isOneToOne: true
                        referencedRelation: "studios"
                        referencedColumns: ["id"]
                    },
                ]
            }
            message_blocks: {
                Row: {
                    created_at: string | null
                    emotional_promise: string
                    id: string
                    proof_point: string | null
                    studio_id: string
                    updated_at: string | null
                    value_proposition: string
                }
                Insert: {
                    created_at?: string | null
                    emotional_promise: string
                    id?: string
                    proof_point?: string | null
                    studio_id: string
                    updated_at?: string | null
                    value_proposition: string
                }
                Update: {
                    created_at?: string | null
                    emotional_promise?: string
                    id?: string
                    proof_point?: string | null
                    studio_id?: string
                    updated_at?: string | null
                    value_proposition?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "message_blocks_studio_id_fkey"
                        columns: ["studio_id"]
                        isOneToOne: true
                        referencedRelation: "studios"
                        referencedColumns: ["id"]
                    },
                ]
            }
            profiles: {
                Row: {
                    avatar_url: string | null
                    created_at: string | null
                    email: string | null
                    full_name: string | null
                    id: string
                    is_admin: boolean | null
                    onboarding_completed: boolean | null
                    role: string | null
                    studio_name: string | null
                    updated_at: string | null
                }
                Insert: {
                    avatar_url?: string | null
                    created_at?: string | null
                    email?: string | null
                    full_name?: string | null
                    id: string
                    is_admin?: boolean | null
                    onboarding_completed?: boolean | null
                    role?: string | null
                    studio_name?: string | null
                    updated_at?: string | null
                }
                Update: {
                    avatar_url?: string | null
                    created_at?: string | null
                    email?: string | null
                    full_name?: string | null
                    id?: string
                    is_admin?: boolean | null
                    onboarding_completed?: boolean | null
                    role?: string | null
                    studio_name?: string | null
                    updated_at?: string | null
                }
                Relationships: []
            }
            studio_assets: {
                Row: {
                    asset_type: string
                    created_at: string | null
                    file_name: string
                    file_path: string
                    id: string
                    studio_id: string
                }
                Insert: {
                    asset_type: string
                    created_at?: string | null
                    file_name: string
                    file_path: string
                    id?: string
                    studio_id: string
                }
                Update: {
                    asset_type?: string
                    created_at?: string | null
                    file_name?: string
                    file_path?: string
                    id?: string
                    studio_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "studio_assets_studio_id_fkey"
                        columns: ["studio_id"]
                        isOneToOne: false
                        referencedRelation: "studios"
                        referencedColumns: ["id"]
                    },
                ]
            }
            studio_defaults: {
                Row: {
                    context: string
                    created_at: string | null
                    id: string
                    identity_presence: string
                    outcome_goal: string
                    platform: string
                    studio_id: string
                    updated_at: string | null
                }
                Insert: {
                    context: string
                    created_at?: string | null
                    id?: string
                    identity_presence: string
                    outcome_goal: string
                    platform: string
                    studio_id: string
                    updated_at?: string | null
                }
                Update: {
                    context?: string
                    created_at?: string | null
                    id?: string
                    identity_presence?: string
                    outcome_goal?: string
                    platform?: string
                    studio_id?: string
                    updated_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "studio_defaults_studio_id_fkey"
                        columns: ["studio_id"]
                        isOneToOne: true
                        referencedRelation: "studios"
                        referencedColumns: ["id"]
                    },
                ]
            }
            studios: {
                Row: {
                    created_at: string | null
                    id: string
                    name: string
                    role: string
                    updated_at: string | null
                    user_id: string
                }
                Insert: {
                    created_at?: string | null
                    id?: string
                    name: string
                    role: string
                    updated_at?: string | null
                    user_id: string
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    name?: string
                    role?: string
                    updated_at?: string | null
                    user_id?: string
                }
                Relationships: []
            }
            projects: {
                Row: {
                    id: string
                    studio_id: string
                    name: string
                    state: string
                    outcome_goal: string | null
                    platform: string | null
                    context: string | null
                    identity_presence: string | null
                    actor_id: string | null
                    actor_locked: boolean
                    creative_dna_snapshot: Json | null
                    message_blocks_snapshot: Json | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    studio_id: string
                    name: string
                    state?: string
                    outcome_goal?: string | null
                    platform?: string | null
                    context?: string | null
                    identity_presence?: string | null
                    actor_id?: string | null
                    actor_locked?: boolean
                    creative_dna_snapshot?: Json | null
                    message_blocks_snapshot?: Json | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    studio_id?: string
                    name?: string
                    state?: string
                    outcome_goal?: string | null
                    platform?: string | null
                    context?: string | null
                    identity_presence?: string | null
                    actor_id?: string | null
                    actor_locked?: boolean
                    creative_dna_snapshot?: Json | null
                    message_blocks_snapshot?: Json | null
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "projects_studio_id_fkey"
                        columns: ["studio_id"]
                        isOneToOne: false
                        referencedRelation: "studios"
                        referencedColumns: ["id"]
                    },
                ]
            }
            scenes: {
                Row: {
                    id: string
                    project_id: string
                    order_index: number
                    scene_goal: string
                    scene_text: string
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    project_id: string
                    order_index?: number
                    scene_goal: string
                    scene_text: string
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    project_id?: string
                    order_index?: number
                    scene_goal?: string
                    scene_text?: string
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "scenes_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                ]
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

type SchemaName = keyof Omit<Database, "__InternalSupabase">

type PublicSchema = Database[Extract<SchemaName, "public">]

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: SchemaName },
    TableName extends PublicTableNameOrOptions extends { schema: SchemaName }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: SchemaName }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: SchemaName },
    TableName extends PublicTableNameOrOptions extends { schema: SchemaName }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: SchemaName }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: SchemaName },
    TableName extends PublicTableNameOrOptions extends { schema: SchemaName }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: SchemaName }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: SchemaName },
    EnumName extends PublicEnumNameOrOptions extends { schema: SchemaName }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: SchemaName }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: SchemaName },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: SchemaName
    }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: SchemaName }
    ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
