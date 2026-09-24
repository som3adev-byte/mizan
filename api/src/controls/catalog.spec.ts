import { readFileSync } from 'node:fs';

// The seed file is the source the ecc_catalog migration was generated from.
// ECC-2:2024 structure: 4 domains, 28 subdomains, 108 main controls, 92 subcontrols.
const catalog = JSON.parse(readFileSync(new URL('../../prisma/catalog/ecc-2-2024.json', import.meta.url), 'utf8')) as {
  domains: { code: string }[];
  subdomains: { code: string; domain: string; objectiveAr: string; objectiveEn: string }[];
  controls: { code: string; subdomain: string; parent: string | null; textAr: string; textEn: string }[];
};

describe('ECC-2:2024 catalog', () => {
  it('has the structure of the official document', () => {
    expect(catalog.domains).toHaveLength(4);
    expect(catalog.subdomains).toHaveLength(28);
    expect(catalog.controls.filter((c) => c.parent === null)).toHaveLength(108);
    expect(catalog.controls.filter((c) => c.parent !== null)).toHaveLength(92);
  });

  it('has unique, well-formed codes that point at existing parents', () => {
    const codes = new Set(catalog.controls.map((c) => c.code));
    expect(codes.size).toBe(catalog.controls.length);
    const subdomains = new Set(catalog.subdomains.map((s) => s.code));
    const domains = new Set(catalog.domains.map((d) => d.code));
    for (const s of catalog.subdomains) expect(domains.has(s.domain)).toBe(true);
    for (const c of catalog.controls) {
      expect(c.code).toMatch(/^\d+-\d+-\d+(-\d+)?$/);
      expect(subdomains.has(c.subdomain)).toBe(true);
      expect(c.code.startsWith(`${c.subdomain}-`)).toBe(true);
      if (c.parent) expect(codes.has(c.parent) && c.code.startsWith(`${c.parent}-`)).toBe(true);
    }
  });

  it('writes numbers with Latin digits and has no empty text', () => {
    const text = JSON.stringify(catalog);
    expect(text).not.toMatch(/[٠-٩]/);
    for (const c of catalog.controls) expect(c.textAr.trim().length).toBeGreaterThan(10);
    for (const s of catalog.subdomains) expect(s.objectiveAr.trim().length).toBeGreaterThan(10);
  });

  it('has the official English text for every objective and control, cleanly extracted', () => {
    for (const x of [...catalog.subdomains.map((s) => s.objectiveEn), ...catalog.controls.map((c) => c.textEn)]) {
      expect(x.trim().length).toBeGreaterThan(10);
      // Leftovers of PDF extraction: glued words, page headers, double spaces, dotted codes.
      expect(x).not.toMatch(/\w{25,}|\s{2}|Essential Cybersecurity Controls|\d\.\d\.\d/);
      expect(x).not.toMatch(/Cybersecurity (Governance|Defense|Resilience)$/);
    }
  });
});
