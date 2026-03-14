# SurvivalMesh: Step-by-Step Build Guide

This guide maps your 14 features into concrete implementation steps inside this repository.

## Phase 1: Core Communication (Implemented)

### 1) Multi-hop mesh messaging
- Implemented files:
  - `src/mesh/MeshRouter.ts`
  - `src/types/mesh.ts`
- What it includes:
  - Packet schema: `id`, `ttl`, `senderId`, `payload`, `type`, `timestamp`
  - `seenMessages` dedupe
  - TTL decrement and forward
  - BLE scan/connect/send/receive hooks

### 2) Store-and-forward DTN
- Implemented files:
  - `src/mesh/MessageQueue.ts`
  - `src/storage/Database.ts`
- What it includes:
  - SQLite queue for undelivered packets
  - `syncWith(peerId, peerMessageIds)`
  - `markDelivered(id)` and `getUndelivered()`

### 5) Distributed bulletin board
- Implemented files:
  - `src/mesh/BulletinBoard.ts`
  - `src/screens/BulletinScreen.tsx`
  - `src/storage/Database.ts` (`posts` table)
- What it includes:
  - `createPost`, `getPosts`, `syncPosts`, `pruneExpired`
  - Compose modal and grouped cards by tag

### 6) Mesh visualizer
- Implemented files:
  - `src/components/MeshVisualizer.tsx`
  - `src/screens/MeshScreen.tsx`
- What it includes:
  - SVG node and edge rendering
  - RSSI-based edge opacity
  - `animateHop(fromId, toId)` using Reanimated

### 14) Beacon mode
- Implemented file:
  - `src/mesh/BeaconMode.ts`
- What it includes:
  - Background fetch task
  - short BLE scan cycle
  - notification update

## Phase 2: Feature Modules Ready (Implemented as adapters/templates)

### 3) Acoustic transfer
- Implemented file:
  - `src/mesh/AcousticTransfer.ts`
- Next required dependency wiring:
  - Plug your ggwave RN adapter into `GgWaveAdapter`
  - Plug a real chunk recorder into `AudioChunkSource`

### 4) LoRa hardware bridge
- Implemented file:
  - `src/mesh/LoRaBridge.ts`
- Next required dependency wiring:
  - Implement `UsbSerialAdapter` using `react-native-usb-serial`

### 7) Embedded knowledge base
- Implemented file:
  - `src/intelligence/KnowledgeBase.ts`
- Required next step:
  - Add `assets/knowledge.db` with `articles` and `articles_fts` tables

### 8) Offline first aid triage
- Implemented files:
  - `src/triage/triageTree.ts`
  - `src/screens/TriageScreen.tsx`
- Next step:
  - Add this screen to navigation in `App.tsx`

### 10) Local geocoding
- Implemented file:
  - `src/intelligence/Geocoder.ts`
- Required next step:
  - Bundle `geocoding.db` with `streets(name, lat, lng, city)` table

### 11) Sun and star navigation (solar math core)
- Implemented file:
  - `src/intelligence/SolarNavigator.ts`
- Next step:
  - Build `NavigationScreen.tsx` with sensors + compass UI

### 12) P2P identity (secure + crypto adapter architecture)
- Implemented file:
  - `src/security/IdentityManager.ts`
- Next required dependency wiring:
  - `expo-secure-store` adapter
  - `tweetnacl` adapter

### 13) Encrypted local storage (SQLCipher architecture)
- Implemented file:
  - `src/security/EncryptedDatabase.ts`
- Next required dependency wiring:
  - `@op-engineering/op-sqlite` SQLCipher adapter
  - PBKDF2 key derivation adapter

## Phase 3: Remaining screens to add

### 9) Offline maps
1. Install:
   - `npx expo install expo-location`
   - `npm install @maplibre/maplibre-react-native`
2. Create `src/screens/MapScreen.tsx`.
3. Add map tab in `App.tsx`.
4. Add local tiles and pin storage table in `src/storage/Database.ts`.

### 11) Navigation screen UI
1. Install:
   - `npx expo install expo-sensors`
2. Create `src/screens/NavigationScreen.tsx`.
3. Use `solarNavigator.getSunPosition(...)` and magnetometer heading.

### 12) Identity screen
1. Install:
   - `npx expo install expo-secure-store expo-barcode-scanner`
   - `npm install tweetnacl react-native-qrcode-svg`
2. Create `src/screens/IdentityScreen.tsx`.
3. Wire contact add via QR scan.

### 13) Passphrase screen
1. Install SQLCipher stack:
   - `npm install @op-engineering/op-sqlite`
2. Create `src/screens/PassphraseScreen.tsx`.
3. Gate app startup behind passphrase unlock.

## Exact next commands

1. Rebuild native android app after native deps:
   - `npm run android`
2. Clean and regenerate if native linking conflicts:
   - `cd android && ./gradlew clean && cd ..`
3. Type-check:
   - `npx tsc --noEmit`

## Verification checklist

1. Mesh packet forwarding across at least 2 hops.
2. Offline message queued and delivered when peer appears.
3. Bulletin post sync and expiry pruning.
4. Mesh visual hop animation on forwarded packet.
5. Beacon task runs and updates notification.
