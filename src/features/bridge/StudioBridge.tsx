import { useEffect } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { academicsKey } from '@/features/academics/subjects'
import { useDataSource } from '@/lib/dataSource'
import { anchorRoute, payloadFromLink, readMessage } from './protocol'
import { bridgeChannel } from './studio'

/** An Android link from Studio is followed once: not again when the app's frame reloads. */
let launchLinkFollowed = false

/**
 * The Studio Bridge, listening (renders nothing):
 * - Android: an ekagra://anchor?bridge_payload=… link from Studio opens the anchor's PDF at its page
 *   (on the web, launch.ts does this for ?bridge_payload=… before the router starts);
 * - Studio tabs at the same address (BroadcastChannel): their anchors show at once, and "open" shows one;
 * - signed in: anchors saved or deleted in Studio (same account) arrive through Supabase Realtime.
 */
export function StudioBridge() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { source, owner } = useDataSource()
  const client = source?.kind === 'supabase' ? source.client : null
  const userId = source?.kind === 'supabase' ? source.userId : null

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const follow = (url: string | undefined) => {
      const payload = url ? payloadFromLink(url) : null
      if (payload) void navigate(anchorRoute(payload))
    }
    if (!launchLinkFollowed) {
      launchLinkFollowed = true
      void App.getLaunchUrl().then((launch) => follow(launch?.url))
    }
    const opened = App.addListener('appUrlOpen', ({ url }) => follow(url))
    return () => {
      void opened.then((listener) => listener.remove())
    }
  }, [navigate])

  useEffect(() => {
    const channel = bridgeChannel()
    if (!channel) return
    const onMessage = (event: MessageEvent) => {
      const message = readMessage(event.data)
      if (!message || message.source !== 'ekagra-studio') return
      if (message.op === 'open') void navigate(anchorRoute(message.payload))
      else void queryClient.invalidateQueries({ queryKey: [...academicsKey(owner), 'anchors'] })
    }
    channel.addEventListener('message', onMessage)
    return () => channel.removeEventListener('message', onMessage)
  }, [navigate, queryClient, owner])

  useEffect(() => {
    if (!client || !userId) return
    const realtime = client
      .channel(`anchors-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_anchors', filter: `user_id=eq.${userId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: [...academicsKey(owner), 'anchors'] })
      })
      .subscribe()
    return () => {
      void client.removeChannel(realtime)
    }
  }, [client, userId, owner, queryClient])

  return null
}
