import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { PermissionsAndroid, Platform } from 'react-native';
import { meshRouter } from './MeshRouter';

const BEACON_TASK = 'BEACON_TASK';

async function hasRequiredBlePermissions(): Promise<boolean> {
	if (Platform.OS !== 'android') {
		return true;
	}

	const sdk = Number(Platform.Version);
	const permissions =
		sdk >= 31
			? [
					PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
					PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
					PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
			  ]
			: [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

	const checks = await Promise.all(permissions.map((perm) => PermissionsAndroid.check(perm)));
	return checks.every(Boolean);
}

async function requestRequiredBlePermissions(): Promise<boolean> {
	if (Platform.OS !== 'android') {
		return true;
	}

	const sdk = Number(Platform.Version);
	const permissions =
		sdk >= 31
			? [
					PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
					PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
					PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
			  ]
			: [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

	const results = await PermissionsAndroid.requestMultiple(permissions);
	return permissions.every((perm) => results[perm] === PermissionsAndroid.RESULTS.GRANTED);
}

TaskManager.defineTask(BEACON_TASK, async () => {
	try {
		const canUseBle = await hasRequiredBlePermissions();
		if (!canUseBle) {
			return BackgroundFetch.BackgroundFetchResult.NoData;
		}

		await meshRouter.startScanning();

		await new Promise<void>((resolve) => {
			setTimeout(() => {
				meshRouter.stopScanning();
				resolve();
			}, 10_000);
		});

		const peers = meshRouter.getConnectedPeerIds().length;

		
		await Notifications.scheduleNotificationAsync({
			content: {
				title: 'Mesh active',
				body: `${peers} nodes nearby`,
			},
			trigger: null,
		});

		return BackgroundFetch.BackgroundFetchResult.NewData;
	} catch {
		return BackgroundFetch.BackgroundFetchResult.Failed;
	}
});

export async function enableBeaconMode(): Promise<void> {
	const bleGranted = await requestRequiredBlePermissions();
	if (!bleGranted) {
		throw new Error('Bluetooth permissions are required for beacon mode.');
	}

	const { status } = await Notifications.requestPermissionsAsync();
	if (status !== 'granted') {
		throw new Error('Notification permission is required for beacon mode.');
	}

	const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(BEACON_TASK);
	if (alreadyRegistered) {
		return;
	}

	await BackgroundFetch.registerTaskAsync(BEACON_TASK, {
		minimumInterval: 60,
		stopOnTerminate: false,
		startOnBoot: true,
	});
}

export async function disableBeaconMode(): Promise<void> {
	const registered = await TaskManager.isTaskRegisteredAsync(BEACON_TASK);
	if (registered) {
		await BackgroundFetch.unregisterTaskAsync(BEACON_TASK);
	}
}

export async function isBeaconModeEnabled(): Promise<boolean> {
	return TaskManager.isTaskRegisteredAsync(BEACON_TASK);
}

export { BEACON_TASK };

