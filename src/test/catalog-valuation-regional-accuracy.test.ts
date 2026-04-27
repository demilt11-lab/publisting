import { describe, expect, it } from 'vitest';
import {
  detectDominantRegion,
  getRegionalConfig,
  getRegionalRate,
  resolveValuationRegion,
} from '@/utils/regionalRates';

describe('catalog valuation regional accuracy', () => {
  it('maps catalog-analysis region keys to valuation regions without falling back to global', () => {
    expect(resolveValuationRegion('us_uk')).toBe('US_UK');
    expect(resolveValuationRegion('india')).toBe('India');
    expect(resolveValuationRegion('latam')).toBe('LatAm');
    expect(resolveValuationRegion('africa')).toBe('Africa');
    expect(resolveValuationRegion('global_blended')).toBe('Global');
  });

  it('uses active Q2 regional benchmark rates for valuation UI calculations', () => {
    expect(getRegionalRate('US_UK', 'spotify')).toBeCloseTo((0.00437 + 0.00412) / 2, 8);
    expect(getRegionalRate('US_UK', 'youtube')).toBeCloseTo((0.00182 + 0.00165) / 2, 8);
    expect(getRegionalRate('India', 'spotify')).toBeCloseTo(0.00089, 8);
    expect(getRegionalRate('India', 'youtube')).toBeCloseTo(0.00042, 8);
  });

  it('keeps US/UK revenue higher than India for an identical catalog', () => {
    const streams = 10_000_000;
    const views = 2_000_000;
    const usUkRevenue = streams * getRegionalRate('US_UK', 'spotify') + views * getRegionalRate('US_UK', 'youtube');
    const indiaRevenue = streams * getRegionalRate('India', 'spotify') + views * getRegionalRate('India', 'youtube');

    expect(usUkRevenue).toBeGreaterThan(indiaRevenue * 3);
  });

  it('detects dominant region from catalog-analysis effective region keys', () => {
    const detected = detectDominantRegion([
      { regionOverride: 'us_uk' },
      { regionOverride: 'us_uk' },
      { regionOverride: 'india' },
    ]);

    expect(detected).toBe('US_UK');
    expect(getRegionalConfig(detected).label).toBe('US / UK');
  });
});
