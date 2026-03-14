import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { meshRouter } from './MeshRouter';

const BEACON_TASK = 'BEACON_TASK';

TaskManager.defineTask(BEACON_TASK, async () => {
	try {
		await meshRouter.startScanning();

		await new Promise<void>((resolve) => {
			setTimeout(() => {
				meshRouter.stopScanning();
				resolve();
			}, 10_000);
		});

		const peers = meshRouter.getConnectedPeerIds().length;

		await Notifications.setNotificationHandler({
			handleNotification: async () => ({
				shouldShowAlert: true,
				shouldPlaySound: false,
				shouldSetBadge: false,
				shouldShowBanner: true,
				shouldShowList: true,
			}),
		});

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

