#!/bin/bash
# Patch MapLibre EventEmitter.java for React Native New Architecture compatibility.
# getReactNativeHost() throws on RN 0.82+; wrap in try-catch and fall back to reactApplicationContext.

FILE="node_modules/@maplibre/maplibre-react-native/android/src/main/java/org/maplibre/reactnative/events/EventEmitter.java"

if [ ! -f "$FILE" ]; then
  echo "[postinstall] MapLibre EventEmitter.java not found, skipping patch."
  exit 0
fi

if grep -q "New Architecture" "$FILE"; then
  echo "[postinstall] MapLibre EventEmitter.java already patched."
  exit 0
fi

sed -i 's/            ReactApplication reactApplication = ((ReactApplication) reactApplicationContext/            try {\n                ReactApplication reactApplication = ((ReactApplication) reactApplicationContext/' "$FILE"
sed -i 's/            return reactApplication/                ReactContext ctx = reactApplication/' "$FILE"
sed -i 's/                    .getCurrentReactContext();/                    .getCurrentReactContext();\n                if (ctx != null) { return ctx; }\n            } catch (Exception e) {\n                Log.d(LOG_TAG, "getReactNativeHost() not available (New Arch), using reactApplicationContext");\n            }/' "$FILE"
sed -i 's/        } else {/        }/' "$FILE"
sed -i 's/            Log.d(LOG_TAG, "getApplicationContext() application doesn'\''t implement ReactApplication");///' "$FILE"
sed -i 's/            return reactApplicationContext;/        return reactApplicationContext;/' "$FILE"

echo "[postinstall] Patched MapLibre EventEmitter.java for New Architecture."
