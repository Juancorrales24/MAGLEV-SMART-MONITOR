export type Role = 'admin' | 'observer';
export type Profile = { id: string; name: string; email: string; role: Role; active: boolean; created_at: string };
export type Device = { id: string; name: string; kind: 'train' | 'solar' | 'combined'; location: string; enabled: boolean; last_seen: string | null; created_at: string };
export type Sample = { id: string; device_id: string; sample_id: string; sampled_at: string | null; created_at: string };
export type Measurement = Sample & { voltage: number | null; current: number | null; power: number | null; energy: number | null };
export type TrainStatus = Sample & { levitation_height: number | null; stability: number | null; temperature: number | null };
export type SolarStation = Sample & { panel_voltage: number | null; panel_current: number | null; battery_level: number | null; power_output: number | null };
type Table<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };
export type Database = { public: {
  Tables: { profiles: Table<Profile>; devices: Table<Device>; measurements: Table<Measurement>; train_status: Table<TrainStatus>; solar_station: Table<SolarStation>; device_credentials: Table<{ device_id: string; token_hash: string; updated_at: string }> };
  Views: Record<string, never>;
  Functions: {
    ingest_telemetry: { Args: { p_device_id: string; p_sample_id: string; p_sampled_at: string | null; p_measurements: unknown; p_train: unknown; p_solar: unknown }; Returns: boolean };
    admin_update_profile: { Args: { p_actor: string; p_id: string; p_name: string; p_role: Role; p_active: boolean }; Returns: undefined };
  };
  Enums: Record<string, never>; CompositeTypes: Record<string, never>;
} };
