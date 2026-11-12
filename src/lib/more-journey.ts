/** In-tab breadcrumb for pages reached through the More menu. Never store user data. */
export const MORE_JOURNEY_KEY = 'treatstory-more-journey-v1';
export function startMoreJourney(): void {
  try { sessionStorage.setItem(MORE_JOURNEY_KEY, JSON.stringify(['/more'])); } catch { /* Storage may be unavailable. */ }
}
/** Close the More flow when the user selects a primary navigation destination. */
export function clearMoreJourney(): void {
  try { sessionStorage.removeItem(MORE_JOURNEY_KEY); } catch { /* Storage may be unavailable. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('treatstory:more-journey-cleared'));
}
export function readMoreJourney(): string[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(MORE_JOURNEY_KEY) || 'null');
    return Array.isArray(raw) && raw[0] === '/more' && raw.length <= 50 &&
      raw.every((x: unknown) => typeof x === 'string' && x.startsWith('/') && !x.startsWith('//'))
      ? raw as string[] : [];
  } catch { return []; }
}
export function storeMoreJourney(list: string[]): void {
  try { sessionStorage.setItem(MORE_JOURNEY_KEY, JSON.stringify(list.slice(-50))); } catch { /* Ignore. */ }
}
/** Plain-language target for the inline back link. Never displays private route params. */
export function moreJourneyBackLabel(href: string): string {
  const route = href.split(/[?#]/, 1)[0];
  const labels: Record<string, string> = {
    '/more': 'More',
    '/account': 'Profile',
    '/account/settings': 'Account settings',
    '/account/personal': 'Personal information',
    '/account/delivery': 'Delivery addresses',
    '/account/privacy': 'Privacy & security',
    '/notifications': 'Notifications',
    '/orders': 'Orders',
    '/favorites': 'Saved items',
  };
  return labels[route] ?? 'previous page';
}

export function nextMoreJourney(history: string[], destination: string): string[] {
  if (history[0] !== '/more' || !destination.startsWith('/') || destination.startsWith('//')) return [];
  if (destination === '/more') return ['/more'];
  const i = history.lastIndexOf(destination);
  return i >= 0 ? history.slice(0, i + 1) : [...history, destination].slice(-50);
}
