import AsyncStorage from '@react-native-async-storage/async-storage'
import type { DocumentStorage } from './localCore'

// Browser preview uses browser storage; installed Android/iOS builds use SQLite.
export const localDocument: DocumentStorage = {
    load: () => AsyncStorage.getItem('thoughts:local-state:v1'),
    save: (value) => AsyncStorage.setItem('thoughts:local-state:v1', value)
}
