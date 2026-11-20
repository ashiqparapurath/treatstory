/**
 * Keep the optional Matrix client bundle off the normal support route.
 * The layout renders working legacy tickets until BOTH rollout gates are on.
 * A customer visiting /support should not download encrypted-chat code
 * while that feature is disabled.
 */
export default async function SupportPage() {
  const enabled =
    process.env.NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED === 'true' &&
    process.env.NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED === 'true';
  if (!enabled) return null;
  const { SupportMatrixWorkspace } = await import('@/components/support-matrix-workspace');
  return <SupportMatrixWorkspace />;
}
