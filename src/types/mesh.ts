export type MeshPacketType = 'message' | 'bulletin' | 'sos';

export interface MeshPacket {
  id: string;
  ttl: number;
  senderId: string;
  payload: string;
  type: MeshPacketType;
  timestamp: number;
}

export type BulletinTag = 'water' | 'medical' | 'danger' | 'route' | 'other';

export interface BulletinPost {
  id: string;
  authorKeyHash: string;
  content: string;
  tag: BulletinTag;
  timestamp: number;
  expiresAt: number;
}

export interface MeshNode {
  id: string;
  label: string;
  x: number;
  y: number;
  rssi: number;
}

export interface MeshEdge {
  from: string;
  to: string;
}
