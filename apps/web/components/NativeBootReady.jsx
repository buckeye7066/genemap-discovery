import { useEffect } from 'react'
import { isNativeApp } from '@/lib/platform.js'
import { startMobileUpdateNotifier } from '@/lib/mobileUpdateNotifier.js'

export default function NativeBootReady() {
  useEffect(() => {
    if (!isNativeApp()) return undefined
    let stopped = false
    import('@capgo/capacitor-updater')
      .then(({ CapacitorUpdater }) => { if (!stopped) return CapacitorUpdater.notifyAppReady() })
      .catch(() => {})
    const stop = startMobileUpdateNotifier({ isNative: true })
    return () => { stopped = true; stop() }
  }, [])
  return null
}
