'use client';
import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
export function PrivateReferencePhoto({ path }: { path: string }) {
  const { user } = useUser();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true,
      objectUrl = '';
    setUrl('');
    setError('');
    if (!user || !/^\/api\/reference-media\/[a-zA-Z0-9_-]+$/.test(path)) return;
    void (async () => {
      try {
        const response = await fetch(path, {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Photo unavailable.');
        objectUrl = URL.createObjectURL(await response.blob());
        if (alive) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      } catch {
        if (alive) setError('Photo unavailable. Try refreshing.');
      }
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, user]);
  if (!path.startsWith('/api/reference-media/'))
    return (
      <p className="text-xs text-amber-800">
        Legacy photo: contact support to replace it with a private upload.
      </p>
    );
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      <img
        src={url}
        alt="Private custom-order reference"
        className="mt-2 max-h-48 rounded-xl"
      />
    </a>
  ) : (
    <p role="status" className="text-xs">
      {error || 'Loading private photo…'}
    </p>
  );
}
