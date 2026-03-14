package com.survivalmesh.app

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.content.Intent
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID

class BleMeshModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "BleMeshModule"
        private val SERVICE_UUID: UUID = UUID.fromString("f0e1d2c3-b4a5-4697-8899-aabbccddeeff")
        private val CHAR_UUID: UUID = UUID.fromString("0f1e2d3c-4b5a-6789-8899-aabbccddeeff")
        private val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
        private const val MAX_PACKET_BYTES = 512
    }

    private var nodeId: String = "unknown"
    private var isRunning = false
    private val bluetoothManager by lazy { reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager }
    private val bluetoothAdapter get() = bluetoothManager.adapter
    private var advertiser: BluetoothLeAdvertiser? = null
    private var advertiseCallback: AdvertiseCallback? = null
    private var gattServer: BluetoothGattServer? = null
    private val connectedCentrals = mutableMapOf<String, BluetoothDevice>()
    private var bleScanner: BluetoothLeScanner? = null
    private var scanCallback: ScanCallback? = null
    private val connectedPeripherals = mutableMapOf<String, BluetoothGatt>()

    override fun getName(): String = "BleMesh"

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    @ReactMethod
    fun isBluetoothEnabled(promise: Promise) {
        try {
            val enabled = bluetoothAdapter?.isEnabled ?: false
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("BT_CHECK_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun enableBluetooth(promise: Promise) {
        try {
            val intent = Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "enableBluetooth failed", e)
            promise.reject("BT_ENABLE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun start(nodeIdArg: String, promise: Promise) {
        if (isRunning) { promise.resolve(true); return }
        nodeId = nodeIdArg
        try {
            if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
                promise.reject("BLE_DISABLED", "Bluetooth is not enabled"); return
            }
            startGattServer()
            startAdvertising()
            startScanning()
            isRunning = true
            Log.d(TAG, "BleMesh started, nodeId=$nodeId")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "start() failed", e)
            promise.reject("BLE_START_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            stopAdvertising(); stopScanning(); stopGattServer(); disconnectAllPeripherals()
            isRunning = false
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("BLE_STOP_FAILED", e.message, e) }
    }

    @ReactMethod
    fun sendPacket(packetJson: String, promise: Promise) {
        if (!isRunning) { promise.resolve(false); return }
        try {
            val bytes = packetJson.toByteArray(Charsets.UTF_8)
            if (bytes.size > MAX_PACKET_BYTES) { promise.reject("PACKET_TOO_LARGE", "Too large"); return }
            val encodedBytes = Base64.encodeToString(bytes, Base64.NO_WRAP).toByteArray(Charsets.UTF_8)
            var sent = false
            gattServer?.let { server ->
                val char = server.getService(SERVICE_UUID)?.getCharacteristic(CHAR_UUID)
                if (char != null) {
                    char.value = encodedBytes
                    connectedCentrals.values.forEach { device ->
                        try { server.notifyCharacteristicChanged(device, char, false); sent = true } catch (e: Exception) {}
                    }
                }
            }
            connectedPeripherals.values.forEach { gatt ->
                try {
                    val char = gatt.getService(SERVICE_UUID)?.getCharacteristic(CHAR_UUID)
                    if (char != null) { char.value = encodedBytes; gatt.writeCharacteristic(char); sent = true }
                } catch (e: Exception) {}
            }
            promise.resolve(sent)
        } catch (e: Exception) { promise.reject("SEND_FAILED", e.message, e) }
    }

    private fun startGattServer() {
        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        val characteristic = BluetoothGattCharacteristic(
            CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ or BluetoothGattCharacteristic.PERMISSION_WRITE
        )
        val cccd = BluetoothGattDescriptor(CCCD_UUID, BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE)
        cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
        characteristic.addDescriptor(cccd)
        service.addCharacteristic(characteristic)
        gattServer = bluetoothManager.openGattServer(reactContext, gattServerCallback)
        gattServer?.addService(service)
    }

    private fun stopGattServer() { gattServer?.close(); gattServer = null; connectedCentrals.clear() }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> { connectedCentrals[device.address] = device; emitPeerEvent("BleMeshPeerConnected", device.address) }
                BluetoothProfile.STATE_DISCONNECTED -> { connectedCentrals.remove(device.address); emitPeerEvent("BleMeshPeerDisconnected", device.address) }
            }
        }
        override fun onCharacteristicWriteRequest(device: BluetoothDevice, requestId: Int, characteristic: BluetoothGattCharacteristic, preparedWrite: Boolean, responseNeeded: Boolean, offset: Int, value: ByteArray) {
            if (responseNeeded) gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
            if (characteristic.uuid == CHAR_UUID && value.isNotEmpty()) handleIncomingBytes(device.address, value)
        }
        override fun onDescriptorWriteRequest(device: BluetoothDevice, requestId: Int, descriptor: BluetoothGattDescriptor, preparedWrite: Boolean, responseNeeded: Boolean, offset: Int, value: ByteArray) {
            if (responseNeeded) gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
        }
    }

    private fun startAdvertising() {
        advertiser = bluetoothAdapter.bluetoothLeAdvertiser ?: return
        val settings = AdvertiseSettings.Builder().setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED).setConnectable(true).setTimeout(0).setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM).build()
        val data = AdvertiseData.Builder().setIncludeDeviceName(true).addServiceUuid(ParcelUuid(SERVICE_UUID)).build()
        val cb = object : AdvertiseCallback() {
            override fun onStartSuccess(s: AdvertiseSettings) { Log.d(TAG, "Advertising started") }
            override fun onStartFailure(e: Int) { Log.e(TAG, "Advertising failed: $e") }
        }
        advertiseCallback = cb
        advertiser?.startAdvertising(settings, data, cb)
    }

    private fun stopAdvertising() { advertiseCallback?.let { advertiser?.stopAdvertising(it) }; advertiseCallback = null; advertiser = null }

    private fun startScanning() {
        bleScanner = bluetoothAdapter.bluetoothLeScanner ?: return
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE_UUID)).build()
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_BALANCED).build()
        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val device = result.device
                if (connectedPeripherals.containsKey(device.address) || connectedCentrals.containsKey(device.address)) return
                connectToPeripheral(device)
            }
            override fun onScanFailed(errorCode: Int) { Log.e(TAG, "Scan failed: $errorCode") }
        }
        scanCallback = cb
        bleScanner?.startScan(listOf(filter), settings, cb)
    }

    private fun stopScanning() { scanCallback?.let { bleScanner?.stopScan(it) }; scanCallback = null; bleScanner = null }

    private fun connectToPeripheral(device: BluetoothDevice) {
        device.connectGatt(reactContext, false, object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                when (newState) {
                    BluetoothProfile.STATE_CONNECTED -> { connectedPeripherals[gatt.device.address] = gatt; emitPeerEvent("BleMeshPeerConnected", gatt.device.address); gatt.discoverServices() }
                    BluetoothProfile.STATE_DISCONNECTED -> { connectedPeripherals.remove(gatt.device.address); emitPeerEvent("BleMeshPeerDisconnected", gatt.device.address); gatt.close() }
                }
            }
            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                if (status != BluetoothGatt.GATT_SUCCESS) return
                val char = gatt.getService(SERVICE_UUID)?.getCharacteristic(CHAR_UUID) ?: return
                gatt.setCharacteristicNotification(char, true)
                val cccd = char.getDescriptor(CCCD_UUID) ?: return
                cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                gatt.writeDescriptor(cccd)
            }
            override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
                if (characteristic.uuid == CHAR_UUID) handleIncomingBytes(gatt.device.address, characteristic.value)
            }
        }, BluetoothDevice.TRANSPORT_LE)
    }

    private fun disconnectAllPeripherals() {
        connectedPeripherals.values.forEach { try { it.disconnect(); it.close() } catch (e: Exception) {} }
        connectedPeripherals.clear()
    }

    private fun handleIncomingBytes(fromAddress: String, bytes: ByteArray) {
        try {
            val payload = try { String(Base64.decode(bytes, Base64.NO_WRAP), Charsets.UTF_8) } catch (e: Exception) { String(bytes, Charsets.UTF_8) }
            val params = Arguments.createMap().apply { putString("fromPeerId", fromAddress); putString("payload", payload) }
            emitEvent("BleMeshPacket", params)
        } catch (e: Exception) { Log.w(TAG, "handleIncomingBytes failed", e) }
    }

    private fun emitPeerEvent(eventName: String, peerId: String) {
        emitEvent(eventName, Arguments.createMap().apply { putString("peerId", peerId) })
    }

    private fun emitEvent(eventName: String, params: WritableMap) {
        try { reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(eventName, params) } catch (e: Exception) {}
    }
}
