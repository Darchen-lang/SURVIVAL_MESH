import { Audio } from 'expo-av';

export interface GgWaveAdapter {
  encode(text: string): Promise<string>;
  decode(base64AudioChunk: string): Promise<string | null>;
}

export interface AudioChunkSource {
  start(onChunk: (base64Chunk: string) => void): Promise<void>;
  stop(): Promise<void>;
}

export class AcousticTransfer {
  private isListening = false;

  constructor(
    private readonly ggwave: GgWaveAdapter,
    private readonly chunkSource: AudioChunkSource,
    private readonly playBase64Wav: (base64Wav: string) => Promise<void>
  ) {}

  async send(text: string): Promise<void> {
    const payload = text.trim();
    if (!payload) {
      return;
    }
    const wavBase64 = await this.ggwave.encode(payload);
    await this.playBase64Wav(wavBase64);
  }

  async startListening(onDecoded: (decodedText: string) => void): Promise<void> {
    if (this.isListening) {
      return;
    }

    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Microphone permission required for acoustic transfer.');
    }

    this.isListening = true;

    await this.chunkSource.start((chunk) => {
      void (async () => {
        if (!this.isListening) {
          return;
        }
        const decoded = await this.ggwave.decode(chunk);
        if (decoded) {
          onDecoded(decoded);
        }
      })();
    });
  }

  async stopListening(): Promise<void> {
    if (!this.isListening) {
      return;
    }
    this.isListening = false;
    await this.chunkSource.stop();
  }
}
