// audioNaming.js
// Canonical audio naming helpers shared by runtime and tooling.

const TABLE_SLUG_OVERRIDES = {
  'Allgemeine Patzer': 'allgemeine_patzer',
  'Grosse Wesen': 'grosse_wesen',
  'Gewaltige Wesen': 'gewaltige_wesen',
};

function transliterateBase(input) {
  return String(input)
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toSnakeSlug(input) {
  return transliterateBase(input)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toLowerCase();
}

export function tableKeyToSlug(tableKey) {
  const raw = String(tableKey || '').trim();
  if (!raw) return '';
  if (TABLE_SLUG_OVERRIDES[raw]) return TABLE_SLUG_OVERRIDES[raw];
  return toSnakeSlug(raw);
}

export function normalizeCategory(category) {
  const c = String(category || '').trim();
  if (!c) return '';
  if (/^[A-E]$/i.test(c)) return c.toUpperCase();
  return toSnakeSlug(c).toUpperCase();
}

export function normalizeRange(rangeKey) {
  let s = String(rangeKey || '').trim();
  if (!s) return '';
  s = s.replace(/[–—]/g, '-').replace(/\s+/g, '');
  if (s === '-100-5') return '0-100';
  if (s.endsWith('+')) {
    const num = parseInt(s.slice(0, -1), 10);
    return Number.isNaN(num) ? s : `${num}+`;
  }
  const twoPart = s.match(/^(-?\d+)-(\d+)$/);
  if (twoPart) {
    const a = parseInt(twoPart[1], 10);
    const b = parseInt(twoPart[2], 10);
    return `${a}-${b}`;
  }
  s = s.replace(/[≤≥]/g, '');
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? s : String(n);
}

export function buildCritAudioRelativePath(tableKey, category, rangeKey) {
  const slug = tableKeyToSlug(tableKey);
  const cat = normalizeCategory(category);
  const range = normalizeRange(rangeKey);
  if (!slug || !cat || !range) return null;
  return `krit/${slug}/${cat}_${range}.mp3`;
}

export function buildLegacyCritAudioFilename(tableKey, category, rangeKey) {
  const safeTyp = transliterateBase(tableKey)
    .replace(/\s+/g, '_')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('_');
  const safeKat = String(category || '').trim().toUpperCase();
  const safeRange = normalizeRange(rangeKey);
  if (!safeTyp || !safeKat || !safeRange) return null;
  return `${safeTyp}_${safeKat}_${safeRange}.mp3`;
}

