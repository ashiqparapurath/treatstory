import { readFileSync } from 'node:fs';
import { getApps } from 'firebase-admin/app';
import { getServerFirebase } from '../src/lib/server/firebase-admin';

/** Read-only comparison. Never logs a credential or user document. */
async function main() {
  getServerFirebase();
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
  const app = getApps().find((a) => a.name === 'treatstory-orders')!;
  const access = await app.options.credential!.getAccessToken();
  async function get(url: string) {
    const response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + access.access_token },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        'Remote configuration inspection failed: ' + response.status,
      );
    return response.json();
  }
  const release = await get(
    `https://firebaserules.googleapis.com/v1/projects/${encodeURIComponent(project)}/releases/cloud.firestore`,
  );
  const rules = await get(
    `https://firebaserules.googleapis.com/v1/${release.rulesetName}`,
  );
  const source = readFileSync('firestore.rules', 'utf8')
    .replace(/\r\n/g, '\n')
    .trim();
  if (
    !rules.source?.files?.some(
      (file: { content: string }) =>
        file.content.replace(/\r\n/g, '\n').trim() === source,
    )
  )
    throw new Error('Deployed Firestore rules do not match this checkout');
  const deployed: any[] = [];
  let cursor = '';
  do {
    const page = await get(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/collectionGroups/-/indexes` +
        (cursor ? '?pageToken=' + encodeURIComponent(cursor) : ''),
    );
    deployed.push(...(page.indexes || []));
    cursor = page.nextPageToken || '';
  } while (cursor);
  const wanted = JSON.parse(
    readFileSync('firestore.indexes.json', 'utf8'),
  ).indexes;
  const fields = (rows: any[]) =>
    JSON.stringify(
      rows
        .filter((f) => f.fieldPath !== '__name__')
        .map((f) => ({
          fieldPath: f.fieldPath,
          ...(f.order ? { order: f.order } : {}),
          ...(f.arrayConfig ? { arrayConfig: f.arrayConfig } : {}),
        })),
    );
  const missing = wanted.filter(
    (index: any) =>
      !deployed.some(
        (actual) =>
          actual.name.includes(
            '/collectionGroups/' + index.collectionGroup + '/',
          ) &&
          actual.queryScope === index.queryScope &&
          actual.state === 'READY' &&
          fields(actual.fields) === fields(index.fields),
      ),
  );
  if (missing.length)
    throw new Error(
      `${missing.length} required indexes are absent or not ready`,
    );
  console.log(
    'Firestore rules match and all declared composite indexes are READY. Live role/account smoke tests and Storage verification remain separate.',
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Rollout verification failed',
  );
  process.exitCode = 1;
});
