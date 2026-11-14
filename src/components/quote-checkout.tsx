'use client';
import { useState, type FormEvent } from 'react';
import { doc } from 'firebase/firestore';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import type { Seller, MarketplaceProduct } from '@/lib/marketplace-types';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './ui/select';
export function QuoteCheckout({
  quote,
  busy,
  onConfirm,
}: {
  quote: {
    id: string;
    sellerId: string;
    productId?: string;
    quotedPrice?: number;
  };
  busy: boolean;
  onConfirm: (value: Record<string, unknown>) => Promise<void>;
}) {
  const db = useFirestore();
  const sellerRef = useMemoFirebase(
    () => (db ? doc(db, 'sellers', quote.sellerId) : null),
    [db, quote.sellerId],
  );
  const productRef = useMemoFirebase(
    () =>
      db && quote.productId
        ? doc(db, 'marketplace_products', quote.productId)
        : null,
    [db, quote.productId],
  );
  const { data: seller } = useDoc<Seller>(sellerRef);
  const { data: product } = useDoc<MarketplaceProduct>(productRef);
  const [mode, setMode] = useState('delivery');
  const [slot, setSlot] = useState('');
  const [weight, setWeight] = useState('');
  const total =
    (quote.quotedPrice || 0) +
    (mode === 'delivery' ? seller?.deliveryFee || 0 : 0);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onConfirm({
      action: 'accept',
      id: quote.id,
      fulfillment: {
        customerName: form.get('name'),
        customerPhone: form.get('phone'),
        deliveryAddress: form.get('address'),
        deliveryMode: mode,
        ...(mode === 'delivery' ? { pincode: form.get('pin') } : {}),
        requestedSlot: slot,
        expectedTotal: total,
        weight: weight ? JSON.parse(weight) : null,
      },
    });
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <p className="text-xs">
        Review the quoted scope for one custom order. Confirm your details to
        place it.
      </p>
      <Input
        name="name"
        aria-label="Customer name"
        placeholder="Your name"
        required
        minLength={2}
        maxLength={120}
      />
      <Input
        name="phone"
        aria-label="Phone number"
        placeholder="Phone number"
        required
        minLength={5}
        maxLength={40}
      />
      <Select value={mode} onValueChange={setMode}>
        <SelectTrigger aria-label="Fulfillment method">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(seller?.deliveryMethods || ['delivery', 'pickup']).map((m) => (
            <SelectItem value={m} key={m}>
              {m === 'delivery' ? 'Delivery' : 'Pickup'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        name="address"
        aria-label="Delivery address or pickup contact details"
        placeholder={
          mode === 'delivery'
            ? 'Full delivery address'
            : 'Pickup contact details'
        }
        required
        minLength={10}
        maxLength={1000}
      />
      {mode === 'delivery' && (
        <Input
          name="pin"
          aria-label="PIN code"
          placeholder="6-digit PIN code"
          required
          pattern="[0-9]{6}"
        />
      )}
      {!!seller?.deliverySlots?.length && (
        <Select value={slot} onValueChange={setSlot}>
          <SelectTrigger aria-label="Time slot">
            <SelectValue placeholder="Choose a time slot" />
          </SelectTrigger>
          <SelectContent>
            {seller.deliverySlots.map((s) => (
              <SelectItem value={s} key={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {!!product?.weightOptions?.length && (
        <Select value={weight} onValueChange={setWeight}>
          <SelectTrigger aria-label="Product size">
            <SelectValue placeholder="Choose quoted size" />
          </SelectTrigger>
          <SelectContent>
            {product.weightOptions.map((w) => (
              <SelectItem
                key={w.value + w.unit}
                value={JSON.stringify({ value: w.value, unit: w.unit })}
              >
                {w.value} {w.unit}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <p className="text-sm font-semibold">
        Total ₹{total.toLocaleString('en-IN')} including delivery · Pay on
        delivery / pickup
      </p>
      <Button
        disabled={busy || !seller || (!!quote.productId && !product)}
        type="submit"
      >
        Place custom order
      </Button>
    </form>
  );
}
