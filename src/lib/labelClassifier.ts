const MAJOR_LABELS: string[] = [
  // UMG
  'universal music', 'umg', 'interscope', 'republic', 'def jam', 'capitol',
  'island', 'polydor', 'virgin', 'cash money', 'motown', 'verve', 'blue note',
  'geffen', 'a&m', 'mercury', 'aftermath', 'young money', 'shady', 'decca',
  // Sony
  'sony music', 'columbia', 'rca', 'epic records', 'arista', 'jive',
  'laface', 'j records', 'loud records', 'zomba', 'syco', 'sony music japan',
  // Warner
  'warner music', 'warner records', 'atlantic', 'elektra', 'asylum', 'nonesuch',
  'reprise', 'rhino', 'sire', 'fueled by ramen', 'parlophone', '300 entertainment',
  // India
  't-series', 'saregama', 'zee music', 'tips music', 'yrf music', 'speed records',
  'eros now', 'times music', 'venus music',
  // Africa
  'mavin records', 'mavin global', 'spaceship', 'starboy', 'dmw',
  'chocolate city', 'empire africa',
  // Korea
  'hybe', 'bighit', 'big hit', 'sm entertainment', 'jyp entertainment',
  'yg entertainment', 'kakao entertainment', 'starship entertainment',
  'pledis entertainment', 'cube entertainment', 'fnc entertainment',
  // Japan
  'avex', 'avex trax', 'being inc', 'king records', 'pony canyon',
  'toy\'s factory', 'sacra music', 'a-sketch', 'victor entertainment',
  'nippon columbia', 'j-storm',
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
