'use client';
import { ActionError } from '@/lib/user-notices';
import type { User } from 'firebase/auth';

export type OrderAction = 'accepted' | 'rejected' | 'preparing' | 'ready' | 'out-for-delivery' |
  'completed' | 'cancelled' | 'request-cancellation' | 'decline-cancellation' | 'cod-collected';

export async function sendOrderAction(user: User, orderId: string, action: OrderAction, reason = '') {
  const token = await user.getIdToken();
  const response = await fetch('/api/orders/action', {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ orderId, action, reason }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; status?: string };
  if (!response.ok) throw new ActionError(payload.error || 'The order could not be updated.', response.status);
  return payload;
}
