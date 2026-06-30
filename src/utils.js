export function cleanText(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeMetadata(metadata = {}) {
  return {
    url: cleanText(metadata.url),
    title: cleanText(metadata.title),
    author: cleanText(metadata.author),
    publicationDate: cleanText(metadata.publicationDate),
    journal: cleanText(metadata.journal),
    doi: cleanText(metadata.doi)
  };
}

export function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function isSupportedUrl(url = '') {
  return /^https?:\/\//i.test(url);
}

export function humanizeReplicable(value) {
  if (value === 'yes') return 'Yes';
  if (value === 'no') return 'No';
  if (value === 'unclear') return 'Unclear';
  return 'Not answered';
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export async function recordIdFromUrl(url) {
  const bytes = new TextEncoder().encode(url);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
