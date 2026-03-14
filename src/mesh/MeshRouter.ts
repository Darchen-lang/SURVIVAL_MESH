import { BleManager, Device } from 'react-native-ble-plx';
import { messageQueue } from './MessageQueue';
import type { MeshPacket, MeshPacketType } from '../types/mesh';

const MESH_NAME = 'SURVIVAL-MESH-01';
const MESH_SERVICE_UUID = 'f0e1d2c3-b4a5-4697-8899-aabbccddeeff';
const MESH_CHARACTERISTIC_UUID = '0f1e2d3c-4b5a-6789-8899-aabbccddeeff';

type MeshEventMap = {
	packetReceived: MeshPacket;
	packetForwarded: { packetId: string; fromPeerId: string; toPeerIds: string[] };
	peerConnected: { peerId: string };
	peerDisconnected: { peerId: string };
};

type Listener<K extends keyof MeshEventMap> = (payload: MeshEventMap[K]) => void;

class TinyEmitter {
	private listeners = new Map<keyof MeshEventMap, Set<Listener<keyof MeshEventMap>>>();

	on<K extends keyof MeshEventMap>(event: K, listener: Listener<K>): () => void {
		const current = this.listeners.get(event) ?? new Set<Listener<keyof MeshEventMap>>();
		current.add(listener as Listener<keyof MeshEventMap>);
		this.listeners.set(event, current);
		return () => this.off(event, listener);
	}

	off<K extends keyof MeshEventMap>(event: K, listener: Listener<K>): void {
		const current = this.listeners.get(event);
		if (!current) {
			return;
		}
		current.delete(listener as Listener<keyof MeshEventMap>);
		if (current.size === 0) {
			this.listeners.delete(event);
		}
	}

	emit<K extends keyof MeshEventMap>(event: K, payload: MeshEventMap[K]): void {
		const current = this.listeners.get(event);
		if (!current) {
			return;
		}
		current.forEach((fn) => fn(payload));
	}
}

export class MeshRouter {
	private manager = new BleManager();
	private seenMessages = new Set<string>();
	private connectedPeers = new Map<string, Device>();
	private emitter = new TinyEmitter();

	on = this.emitter.on.bind(this.emitter);

	async advertise(): Promise<void> {
		// react-native-ble-plx does not expose peripheral mode across all platforms.
		// Keep node identity available for app-layer discovery and future native bridge.
		void MESH_NAME;
	}

	async startScanning(): Promise<void> {
		this.manager.startDeviceScan(null, null, async (error, device) => {
			if (error || !device) {
				return;
			}

			const matchesService = device.serviceUUIDs?.includes(MESH_SERVICE_UUID) ?? false;
			const matchesName = device.localName === MESH_NAME || device.name === MESH_NAME;
			if (!matchesService && !matchesName) {
				return;
			}

			if (this.connectedPeers.has(device.id)) {
				return;
			}

			try {
				const connected = await device.connect({ autoConnect: true });
				const discovered = await connected.discoverAllServicesAndCharacteristics();
				this.connectedPeers.set(discovered.id, discovered);
				this.emitter.emit('peerConnected', { peerId: discovered.id });
				await this.subscribeToPeer(discovered);
			} catch {
				// transient BLE errors are expected in dense scan environments
			}
		});
	}

	stopScanning(): void {
		this.manager.stopDeviceScan();
	}

	getConnectedPeerIds(): string[] {
		return Array.from(this.connectedPeers.keys());
	}

	private async subscribeToPeer(device: Device): Promise<void> {
		try {
			await device.monitorCharacteristicForService(
				MESH_SERVICE_UUID,
				MESH_CHARACTERISTIC_UUID,
				async (error, characteristic) => {
					if (error || !characteristic?.value) {
						return;
					}
					const packet = this.decodePacket(characteristic.value);
					if (packet) {
						await this.receive(device.id, packet);
					}
				}
			);
		} catch {
			this.connectedPeers.delete(device.id);
			this.emitter.emit('peerDisconnected', { peerId: device.id });
		}
	}

	async send(payload: string, senderId: string, type: MeshPacketType = 'message', ttl = 7): Promise<MeshPacket> {
		const packet: MeshPacket = {
			id: this.createId(),
			ttl,
			senderId,
			payload,
			type,
			timestamp: Date.now(),
		};

		this.seenMessages.add(packet.id);
		await messageQueue.upsert(packet, false);
		await this.broadcast(packet, undefined);
		return packet;
	}

	async receive(fromPeerId: string, packet: MeshPacket): Promise<void> {
		if (this.seenMessages.has(packet.id)) {
			return;
		}

		this.seenMessages.add(packet.id);
		await messageQueue.upsert(packet, false);
		this.emitter.emit('packetReceived', packet);

		if (packet.ttl <= 0) {
			return;
		}

		const forwarded: MeshPacket = {
			...packet,
			ttl: packet.ttl - 1,
		};

		await this.broadcast(forwarded, fromPeerId);
	}

	async gossipSync(
		peerId: string,
		peerMessageIds: string[],
		sendToPeer: (peerId: string, packets: MeshPacket[]) => Promise<void>
	): Promise<void> {
		const missingForPeer = await messageQueue.syncWith(peerId, peerMessageIds);
		if (missingForPeer.length === 0) {
			return;
		}
		await sendToPeer(peerId, missingForPeer);
	}

	async disconnectAll(): Promise<void> {
		const peers = Array.from(this.connectedPeers.values());
		await Promise.all(
			peers.map(async (peer) => {
				try {
					await this.manager.cancelDeviceConnection(peer.id);
				} catch {
					// ignore stale connection handles
				}
			})
		);
		this.connectedPeers.clear();
	}

	private async broadcast(packet: MeshPacket, excludePeerId?: string): Promise<void> {
		const encoded = this.encodePacket(packet);
		const peers = Array.from(this.connectedPeers.values()).filter((peer) => peer.id !== excludePeerId);

		const deliveredTo: string[] = [];

		await Promise.all(
			peers.map(async (peer) => {
				try {
					await peer.writeCharacteristicWithoutResponseForService(
						MESH_SERVICE_UUID,
						MESH_CHARACTERISTIC_UUID,
						encoded
					);
					deliveredTo.push(peer.id);
					await messageQueue.markDelivered(packet.id);
				} catch {
					// ignore write failures; DTN queue handles later retries
				}
			})
		);

		if (deliveredTo.length > 0) {
			this.emitter.emit('packetForwarded', {
				packetId: packet.id,
				fromPeerId: excludePeerId ?? 'self',
				toPeerIds: deliveredTo,
			});
		}
	}

	private createId(): string {
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
	}

	private encodePacket(packet: MeshPacket): string {
		if (typeof globalThis.btoa === 'function') {
			return globalThis.btoa(JSON.stringify(packet));
		}
		return JSON.stringify(packet);
	}

	private decodePacket(value: string): MeshPacket | null {
		try {
			const decoded = typeof globalThis.atob === 'function' ? globalThis.atob(value) : value;
			const packet = JSON.parse(decoded) as MeshPacket;
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
	}
}

export const meshRouter = new MeshRouter();

