const MAJOR_LABELS: string[] = [
  // UMG
  'universal music', 'umg', 'interscope', 'republic', 'def jam', 'capitol',
  'island', 'polydor', 'virgin', 'cash money', 'motown', 'verve', 'blue note',
  'geffen', 'a&m', 'mercury', 'aftermath', 'young money', 'shady',
  // Sony
  'sony music', 'columbia', 'rca', 'epic records', 'arista', 'jive',
  'laface', 'j records', 'loud records', 'zomba', 'syco',
  // Warner
  'warner music', 'warner records', 'atlantic', 'elektra', 'asylum', 'nonesuch',
  'reprise', 'rhino', 'sire', 'fueled by ramen', 'parlophone', '300 entertainment',
];

const MAJOR_PUBLISHERS: string[] = [
  'universal music publishing', 'umpg',
  'sony music publishing', 'smp', 'sony/atv',
  'warner chappell',
  'bmg rights', 'bmg music',
  'kobalt',
  'concord',
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 &]/g, '').trim();
}

export function classifyLabel(labelName?: string): 'major' | 'indie' | 'unknown' {
  if (!labelName) return 'unknown';
  const n = normalize(labelName);
  if (!n) return 'unknown';
  return MAJOR_LABELS.some(m => n.includes(m)) ? 'major' : 'indie';
}

export function classifyPublisher(publisherName?: string): 'major' | 'indie' | 'unknown' {
  if (!publisherName) return 'unknown';
  const n = normalize(publisherName);
  if (!n) return 'unknown';
  return MAJOR_PUBLISHERS.some(m => n.includes(m)) ? 'major' : 'indie';
}
