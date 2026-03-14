declare module 'react-native-udp' {
  type MessageHandler = (msg: Uint8Array, rinfo: { address: string; port: number }) => void;
  type ErrorHandler = (error: Error) => void;

  interface UdpSocket {
    bind(port: number): void;
    close(): void;
    setBroadcast(flag: boolean): void;
    send(
      msg: string | Uint8Array,
      offset: number | undefined,
      length: number | undefined,
      port: number,
      address: string,
      callback?: (error?: Error | null) => void
    ): void;
    on(event: 'message', listener: MessageHandler): void;
    on(event: 'error', listener: ErrorHandler): void;
    once(event: 'listening', listener: () => void): void;
  }

  export function createSocket(type: 'udp4' | { type: 'udp4'; debug?: boolean }): UdpSocket;

  const dgram: {
    createSocket: typeof createSocket;
  };

  export default dgram;
}