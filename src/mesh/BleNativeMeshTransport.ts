import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { Buffer } from 'buffer';
import type { MeshPacket } from '../types/mesh';

type PacketHandler = (fromPeerId: string, packet: MeshPacket) => Promise<void>;
type PeerHandler = (peerId: string) => void;

type BleMeshNativeModule = {
  start(nodeId: string): Promise<boolean>;
  stop(): Promise<boolean>;
  sendPacket(packetJson: string): Promise<boolean>;
};

const moduleRef = NativeModules.BleMesh as BleMeshNativeModule | undefined;

export class BleNativeMeshTransport {
  private eventEmitter: NativeEventEmitter | null = null;
  private started = false;
  private subscriptions: Array<{ remove: () => void }> = [];

  isAvailable(): boolean {
    return Platform.OS === 'android' && !!moduleRef;
  }

  isStarted(): boolean {
    return this.started;
  }

  async start(nodeId: string, onPacket: PacketHandler, onPeerConnected: PeerHandler, onPeerDisconnected: PeerHandler): Promise<void> {
    if (!this.isAvailable() || !moduleRef || this.started) {
      return;
    }

    this.eventEmitter = new NativeEventEmitter(moduleRef as never);

    this.subscriptions.push(
      this.eventEmitter.addListener('BleMeshPacket', (event: { fromPeerId?: string; payload?: string }) => {
        const fromPeerId = event.fromPeerId;
        const payload = event.payload;
        if (!fromPeerId || !payload) {
          return;
        }
        try {
          const packet = this.parsePacketPayload(payload);
          if (!packet) {
            return;
          }
          void onPacket(fromPeerId, packet);
        } catch {
          // Ignore malformed packets from native layer.
        }
      }),
      this.eventEmitter.addListener('BleMeshPeerConnected', (event: { peerId?: string }) => {
        if (event.peerId) {
          onPeerConnected(event.peerId);
        }
      }),
      this.eventEmitter.addListener('BleMeshPeerDisconnected', (event: { peerId?: string }) => {
        if (event.peerId) {
          onPeerDisconnected(event.peerId);
        }
      })
    );

    await moduleRef.start(nodeId);
    this.started = true;
  }

  private parsePacketPayload(payload: string): MeshPacket | null {
    const parse = (text: string): MeshPacket | null => {
      try {
        const packet = JSON.parse(text) as MeshPacket;
        if (
          typeof packet.id !== 'string' ||
          typeof packet.ttl !== 'number' ||
          typeof packet.senderId !== 'string' ||
          typeof packet.payload !== 'string'
        ) {
          return null;
        }
        return {
          ...packet,
          type: packet.type ?? 'message',
          timestamp: packet.timestamp ?? Date.now(),
        };
      } catch {
        return null;
      }
    };

    const direct = parse(payload);
    if (direct) {
      return direct;
    }

    try {
      const decoded = Buffer.from(payload, 'base64').toString('utf8');
      return parse(decoded);
    } catch {
      return null;
    }
  }

  async stop(): Promise<void> {
    if (!moduleRef || !this.started) {
      this.started = false;
      return;
    }

    this.subscriptions.forEach((sub) => sub.remove());
    this.subscriptions = [];

    await moduleRef.stop();
    this.started = false;
    this.eventEmitter = null;
  }

  async send(packet: MeshPacket): Promise<boolean> {
    if (!moduleRef || !this.started) {
      return false;
    }

    return moduleRef.sendPacket(JSON.stringify(packet));
  }
}
