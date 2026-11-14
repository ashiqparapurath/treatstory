'use client';
import { useState } from 'react';
import { useUser } from '@/firebase';
import { Button } from '../ui/button';
type Status = {
  failedMail: number;
  mailNeedingReview: number;
  pendingDeletions: number;
  oldestDueAt: string | null;
  workerLastSeen: string | null;
  backupVerifiedAt: string | null;
  legalDetailsComplete: boolean;
  encryptedChatEnabled: boolean;
};
export function OperationsStatus() {
  const { user } = useUser();
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/operations', {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error();
      setData(await response.json());
    } catch {
      setError(
        'Operational checks unavailable. Check server configuration and indexes.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Operational health</h2>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          {busy ? 'Checking…' : 'Check operations'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {data && (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt>Failed email / manual review</dt>
            <dd>
              {data.failedMail} / {data.mailNeedingReview}
            </dd>
          </div>
          <div>
            <dt>Pending account deletions</dt>
            <dd>{data.pendingDeletions}</dd>
          </div>
          <div>
            <dt>Mail worker</dt>
            <dd>
              {data.workerLastSeen
                ? new Date(data.workerLastSeen).toLocaleString()
                : 'No successful run recorded'}
              {(!data.workerLastSeen ||
                Date.now() - Date.parse(data.workerLastSeen) > 30 * 60000) &&
                ' · Needs attention'}
            </dd>
          </div>
          <div>
            <dt>Oldest due email</dt>
            <dd>
              {data.oldestDueAt
                ? new Date(data.oldestDueAt).toLocaleString()
                : 'None'}
            </dd>
          </div>
          <div>
            <dt>Backup restore verification</dt>
            <dd>
              {data.backupVerifiedAt
                ? new Date(data.backupVerifiedAt).toLocaleString()
                : 'Not recorded'}
            </dd>
          </div>
          <div>
            <dt>Legal contact details</dt>
            <dd>
              {data.legalDetailsComplete
                ? 'Configured — owner review required'
                : 'Incomplete — launch blocker'}
            </dd>
          </div>
          <div>
            <dt>Encrypted chat</dt>
            <dd>
              {data.encryptedChatEnabled
                ? 'Enabled — verify release evidence'
                : 'Disabled'}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
