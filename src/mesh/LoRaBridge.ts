type LoRaEvent =
  | { type: 'connected'; deviceId: string }
  | { type: 'disconnected'; deviceId?: string }
  | { type: 'message'; payload: string };

type LoRaListener = (event: LoRaEvent) => void;

export interface UsbSerialAdapter {
  onDeviceConnected(cb: (deviceId: string) => void): () => void;
  onDeviceDisconnected(cb: (deviceId: string) => void): () => void;
  open(deviceId: string, baudRate: number): Promise<void>;
  write(text: string): Promise<void>;
  onData(cb: (chunk: string) => void): () => void;
}

export class LoRaBridge {
  private connectedDeviceId: string | null = null;
  private listeners = new Set<LoRaListener>();
  private buffer = '';
  private unsubscribeFns: Array<() => void> = [];

  constructor(private readonly adapter: UsbSerialAdapter) {}

  onEvent(listener: LoRaListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  startReading(): void {
    const offConnect = this.adapter.onDeviceConnected((deviceId) => {
      void this.handleConnect(deviceId);
    });

    const offDisconnect = this.adapter.onDeviceDisconnected((deviceId) => {
      if (this.connectedDeviceId === deviceId) {
        this.connectedDeviceId = null;
      }
      this.emit({ type: 'disconnected', deviceId });
    });

    const offData = this.adapter.onData((chunk) => this.handleChunk(chunk));

    this.unsubscribeFns = [offConnect, offDisconnect, offData];
  }

  stopReading(): void {
    this.unsubscribeFns.forEach((fn) => fn());
    this.unsubscribeFns = [];
  }

  async send(text: string): Promise<void> {
    if (!this.connectedDeviceId) {
      throw new Error('No LoRa USB device connected.');
    }
    await this.adapter.write(`SEND:${text}\n`);
  }

  private async handleConnect(deviceId: string): Promise<void> {
    await this.adapter.open(deviceId, 115200);
    this.connectedDeviceId = deviceId;
    this.emit({ type: 'connected', deviceId });
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    lines.forEach((line) => {
      const cleaned = line.trim();
      if (!cleaned.startsWith('RECV:')) {
        return;
      }
      this.emit({ type: 'message', payload: cleaned.slice(5) });
    });
  }

  private emit(event: LoRaEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}
