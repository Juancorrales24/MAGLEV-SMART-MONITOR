export type Role = 'admin' | 'observer';
export type Profile = { id: string; name: string; email: string; role: Role; active: boolean; created_at: string };
export type Device = { id: string; name: string; kind: 'train' | 'solar' | 'combined'; location: string; enabled: boolean; last_seen: string | null; created_at: string };
export type Sample = { id: string; device_id: string; sample_id: string; sampled_at: string | null; created_at: string };
// measurements.device_id admite null: filas heredadas del esquema inicial sin dispositivo (database.sql).
export type Measurement = Omit<Sample, 'device_id'> & { device_id: string | null; voltage: number | null; current: number | null; power: number | null; energy: number | null };
// station_number/detected son el contrato vigente (sensores infrarrojos). Las columnas de levitación
// siguen en la tabla para no perder registros antiguos, pero la interfaz ya no las presenta.
export type TrainStatus = Sample & { station_number: number | null; detected: boolean | null; prev_station_number: number | null; ms_from_prev: number | null; lap_ms: number | null; levitation_height: number | null; stability: number | null; temperature: number | null };
/** Autodiagnóstico del ESP32 cada ~30 s: todo lo mide el propio dispositivo. */
export type DeviceHealth = Sample & { reset_reason: string | null; uptime_s: number | null; rssi_dbm: number | null; free_heap_b: number | null; queue_dropped: number | null };
// panel_current/power_output quedan por compatibilidad: el prototipo no mide corriente ni potencia.
export type SolarStation = Sample & { panel_voltage: number | null; battery_voltage: number | null; battery_level: number | null; panel_current: number | null; power_output: number | null };
export type Station = { id: string; position: number; name: string; gap_to_next_m: number | null; created_at: string };
type Table<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };
export type Database = { public: {
  Tables: { profiles: Table<Profile>; devices: Table<Device>; measurements: Table<Measurement>; stations: Table<Station>; train_status: Table<TrainStatus>; solar_station: Table<SolarStation>; device_health: Table<DeviceHealth>; device_credentials: Table<{ device_id: string; token_hash: string; updated_at: string }>; ingest_receipts: Table<{ device_id: string; sample_id: string; created_at: string }> };
  Views: Record<string, never>;
  Functions: {
    ingest_telemetry: { Args: { p_device_id: string; p_sample_id: string; p_sampled_at: string | null; p_measurements: unknown; p_train: unknown; p_solar: unknown }; Returns: boolean };
    admin_update_profile: { Args: { p_actor: string; p_id: string; p_name: string; p_role: Role; p_active: boolean }; Returns: undefined };
  };
  Enums: Record<string, never>; CompositeTypes: Record<string, never>;
} };
