// Accept shared profile links and discard tracking parameters before publishing.
export function instagramProfileUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return '';
  const match = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-z0-9._]{1,30})\/?(?:[?#][^\s]*)?$/i.exec(value);
  if (!match || /^\.{1,2}$/.test(match[1])) return null;
  return 'https://www.instagram.com/' + match[1] + '/';
}

export const fssaiNumberPattern = /^[0-9]{14}$/;
