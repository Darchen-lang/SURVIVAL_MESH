import dgram from 'react-native-udp';
import { Buffer } from 'buffer';
import type { MeshPacket } from '../types/mesh';

type UdpWirePacket = {
  sourceNodeId: string;
  packet: MeshPacket;
};

type PacketHandler = (fromNodeId: string, packet: MeshPacket) => Promise<void>;

const DEFAULT_PORT = 41234;
const DEFAULT_MULTICAST_ADDR = '239.255.42.99';
const DEFAULT_BROADCAST_ADDR = '255.255.255.255';
const UDP_SEND_TARGETS = [DEFAULT_MULTICAST_ADDR, DEFAULT_BROADCAST_ADDR] as const;

export class UdpMeshTransport {
  private socket: ReturnType<typeof dgram.createSocket> | null = null;
  private started = false;
  private sourceNodeId = '';

  isStarted(): boolean {
    return this.started;
  }

  async start(sourceNodeId: string, onPacket: PacketHandler): Promise<void> {
    if (this.started) {
      return;
    }

    this.sourceNodeId = sourceNodeId;

    const socket = dgram.createSocket({ type: 'udp4' });
    socket.on('message', (raw) => {
      try {
        const text = Buffer.from(raw).toString('utf8');
        const parsed = JSON.parse(text) as UdpWirePacket;
        if (!parsed?.packet || typeof parsed.sourceNodeId !== 'string') {
          return;
        }
        if (parsed.sourceNodeId === this.sourceNodeId) {
          return;
        }
        console.info('[UdpMesh] rx', parsed.packet.id, 'from', parsed.sourceNodeId);
        void onPacket(parsed.sourceNodeId, parsed.packet);
      } catch {
        // Ignore malformed payloads from other local UDP broadcasters.
      }
    });

    socket.on('error', (error) => {
      console.warn('[UdpMesh] socket error', error.message);
      // Keep the app resilient on transient local network failures.
    });

    await new Promise<void>((resolve) => {
      socket.once('listening', () => {
        // Multicast is more reliable on Android than global broadcast and avoids
        // socket lock contention observed with setBroadcast on some OEM stacks.
        const withBroadcast = socket as unknown as { setBroadcast?: (flag: boolean) => void };
        const withMembership = socket as unknown as { addMembership?: (address: string) => void };
        withBroadcast.setBroadcast?.(true);
        withMembership.addMembership?.(DEFAULT_MULTICAST_ADDR);
        console.info('[UdpMesh] listening on', DEFAULT_PORT, 'group', DEFAULT_MULTICAST_ADDR);
        resolve();
      });
      socket.bind(DEFAULT_PORT);
    });

    this.socket = socket;
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.socket) {
      this.started = false;
      return;
    }

    this.socket.close();
    this.socket = null;
    this.started = false;
  }

  async send(packet: MeshPacket): Promise<boolean> {
    if (!this.socket || !this.started) {
      return false;
    }

    const payload: UdpWirePacket = {
      sourceNodeId: this.sourceNodeId,
      packet,
    };

    const text = JSON.stringify(payload);
    const bytes = Buffer.from(text, 'utf8');

    return new Promise<boolean>((resolve) => {
      const { socket } = this;
      if (!socket) {
        resolve(false);
        return;
      }

      const tryTarget = (index: number): void => {
        if (index >= UDP_SEND_TARGETS.length) {
          console.warn('[UdpMesh] tx failed', packet.id, 'all targets unreachable');
          resolve(false);
          return;
        }

        const target = UDP_SEND_TARGETS[index];
        socket.send(bytes, 0, bytes.length, DEFAULT_PORT, target, (error) => {
          if (!error) {
            console.info('[UdpMesh] tx', packet.id, 'to', target);
            resolve(true);
            return;
          }

          console.warn('[UdpMesh] tx failed', packet.id, target, error.message);
          tryTarget(index + 1);
        });
      };

      tryTarget(0);
    });
  }
}
