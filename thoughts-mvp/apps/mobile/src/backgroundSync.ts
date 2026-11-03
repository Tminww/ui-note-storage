import { AppState, Platform } from 'react-native'
import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import NetInfo from '@react-native-community/netinfo'
import { initializeDeviceConfig } from './deviceConfig'
import { loadApiUrl } from './api'
import { localRepository, syncLocalData, syncSnapshot } from './localService'

const TASK = 'thoughts-local-queue-v1'
if (Platform.OS !== 'web')
    TaskManager.defineTask(TASK, async () => {
        if (AppState.currentState === 'active') return BackgroundTask.BackgroundTaskResult.Success
        try {
            const network = await NetInfo.fetch()
            if (network.isConnected === false || network.isInternetReachable === false)
                return BackgroundTask.BackgroundTaskResult.Success
            await Promise.all([
                initializeDeviceConfig(),
                loadApiUrl(),
                localRepository.initialize()
            ])
            await localRepository.reload()
            await syncLocalData()
            return syncSnapshot().error
                ? BackgroundTask.BackgroundTaskResult.Failed
                : BackgroundTask.BackgroundTaskResult.Success
        } catch {
            return BackgroundTask.BackgroundTaskResult.Failed
        }
    })
export async function registerBackgroundSync() {
    if (Platform.OS === 'web' || !(await TaskManager.isAvailableAsync())) return
    if (!(await TaskManager.isTaskRegisteredAsync(TASK)))
        await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 })
}
