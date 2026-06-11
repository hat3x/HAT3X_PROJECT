import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function registerPushServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (e) {
    console.error('[SW] registro fallido', e);
  }
}

export function usePushSubscription() {
  const subscribe = useCallback(async (sessionId: string, pedidoId: string): Promise<void> => {
    if (!VAPID_PUBLIC_KEY) return;
    if (!('Notification' in window) || !('PushManager' in window)) return;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      await supabase
        .from('push_subscriptions' as any)
        .upsert(
          { session_id: sessionId, pedido_id: pedidoId, subscription: sub.toJSON() },
          { onConflict: 'session_id,pedido_id' }
        );
    } catch (e) {
      console.error('[Push] suscripción fallida', e);
    }
  }, []);

  return { subscribe };
}
