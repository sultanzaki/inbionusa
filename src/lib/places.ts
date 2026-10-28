export const roomKinds = {
  warehouse: "Warehouse",
  laboratory: "Laboratory",
  production: "Production",
  office: "Office",
  other: "Other",
} as const;
export type RoomKind = keyof typeof roomKinds;
export type Place = {
  id: string;
  name: string;
  address: string;
  active: boolean;
  version: number;
  room_count: number;
};
export type Room = {
  id: string;
  name: string;
  room_name: string;
  room_kind: RoomKind;
  warehouse_id: string;
  warehouse: string;
  active: boolean;
  site_active: boolean;
  version: number;
};
