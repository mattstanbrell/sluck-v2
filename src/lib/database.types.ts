export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          created_at: string
          email: string
          full_name: string
          display_name: string | null
          avatar_url: string | null
          last_seen: string | null
        }
        Insert: {
          id: string
          created_at?: string
          email: string
          full_name: string
          display_name?: string | null
          avatar_url?: string | null
          last_seen?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          email?: string
          full_name?: string
          display_name?: string | null
          avatar_url?: string | null
          last_seen?: string | null
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string | null
          channel_id: string | null
          user_id: string
          content: string
          created_at: string
          parent_id: string | null
          thread_participant: boolean | null
          profiles?: {
            id: string
            full_name: string
            display_name: string | null
            avatar_url: string | null
          }
        }
        Insert: {
          id?: string
          conversation_id?: string | null
          channel_id?: string | null
          user_id?: string
          content: string
          created_at?: string
          parent_id?: string | null
          thread_participant?: boolean | null
        }
        Update: {
          id?: string
          conversation_id?: string | null
          channel_id?: string | null
          user_id?: string
          content?: string
          created_at?: string
          parent_id?: string | null
          thread_participant?: boolean | null
        }
      }
    }
  }
} 