/** Approximate city/region label only: never a street, house number or exact coordinates. */
export function approximateAreaLabel(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const response = value as { address?: Record<string, unknown> };
  const address = response.address;
  if (!address || typeof address !== 'object') return null;
  const text = (...keys: string[]) => {
    for (const key of keys) {
      const value = address[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim().replace(/[\u0000-\u001f]+/g, ' ').slice(0, 65);
      }
    }
    return '';
  };
  const city = text('city', 'town', 'village', 'municipality', 'city_district', 'state_district', 'county', 'state');
  const countryCode = text('country_code').toLowerCase();
  const region = countryCode === 'in' ? text('state', 'country') : text('country', 'state');
  const label = [city, region].filter((part, index, all) => part && all.indexOf(part) === index).join(', ');
  return label ? label.slice(0, 95) : null;
}
