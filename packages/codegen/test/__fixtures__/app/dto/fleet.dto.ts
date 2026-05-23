export interface FleetResponse {
  vessels: Array<{ id: string; name: string }>;
  total: number;
}

export interface TelemetryBody {
  lat: number;
  lng: number;
  timestamp: string;
}

export type VesselStatus = 'active' | 'docked' | 'maintenance';

export enum VesselType {
  CARGO = 'cargo',
  TANKER = 'tanker',
  PATROL = 'patrol',
}
