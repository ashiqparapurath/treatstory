'use client';
import { useState, type FormEvent } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  useUser,
} from '@/firebase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useToast } from '@/hooks/use-toast';
type Submission = {
  id: string;
  sellerId: string;
  businessName: string;
  licenseNumber: string;
  expiresOn: string;
};
export function SellerCompliance({ admin = false }: { admin?: boolean }) {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const ref = useMemoFirebase(
    () =>
      db && admin
        ? query(
            collection(db, 'seller_compliance'),
            where('status', '==', 'pending'),
            limit(20),
          )
        : null,
    [db, admin],
  );
  const { data, error } = useCollection<Submission>(ref);
  async function send(value: Record<string, unknown>) {
    if (!user) return;
    setBusy(true);
    try {
      const response = await fetch('/api/seller/compliance', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(value),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      toast({ title: 'License details saved' });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: e instanceof Error ? e.message : 'Could not save license',
      });
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await send({
      action: 'submit',
      licenseNumber: form.get('license'),
      expiresOn: form.get('expiry'),
    });
  }
  return (
    <section className="rounded-2xl border bg-white p-5 text-[#29251f]">
      <h2 className="font-semibold">Food seller verification</h2>
      <p className="mt-2 text-xs leading-6">
        Food sellers must provide current FSSAI registration or license details.
        Verification is a document check, not a product safety guarantee.
      </p>
      {admin ? (
        <div className="mt-4 space-y-4">
          {error && <p role="alert">Could not load license submissions.</p>}
          {!data?.length && !error && (
            <p className="text-sm">No pending license checks.</p>
          )}
          {data?.map((s) => (
            <form
              key={s.id}
              className="space-y-2 rounded-xl border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void send({
                  action: 'review',
                  sellerId: s.sellerId,
                  approved: true,
                  note: f.get('note'),
                });
              }}
            >
              <p>
                {s.businessName} · {s.licenseNumber} · expires {s.expiresOn}
              </p>
              <a
                href="https://foscos.fssai.gov.in/"
                target="_blank"
                rel="noreferrer"
                className="text-xs underline"
              >
                Verify business and license in FoSCoS
              </a>
              <Input
                name="note"
                required
                minLength={10}
                maxLength={500}
                aria-label="Verification evidence"
                placeholder="Record source, date and matching business details"
              />
              <label className="block text-xs">
                <input type="checkbox" required /> I checked the current license
                and matching business details.
              </label>
              <Button disabled={busy} type="submit">
                Confirm verification
              </Button>
            </form>
          ))}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-xs">
            FSSAI number
            <Input name="license" required pattern="[0-9]{14}" maxLength={14} />
          </label>
          <label className="block text-xs">
            Expiry date
            <Input name="expiry" type="date" required />
          </label>
          <Button disabled={busy} type="submit">
            Submit for verification
          </Button>
        </form>
      )}
    </section>
  );
}
