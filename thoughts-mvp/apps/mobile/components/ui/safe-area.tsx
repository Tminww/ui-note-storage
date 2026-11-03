import { SafeAreaView as NativeSafeAreaView } from 'react-native-safe-area-context'
import { withUniwind } from 'uniwind'

// This library renders a custom native view: Metro's RN component wrappers do not
// translate its className. Without this adapter, flex-1 is lost on Android/iOS.
export const SafeAreaView = withUniwind(NativeSafeAreaView)
