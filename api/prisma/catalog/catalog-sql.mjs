// Prints SQL for the ECC-2:2024 catalog from ecc-2-2024.json.
//   node prisma/catalog/catalog-sql.mjs          INSERTs (ecc_catalog migration)
//   node prisma/catalog/catalog-sql.mjs english  UPDATEs adding the English text
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('./ecc-2-2024.json', import.meta.url), 'utf8'));

const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
const insert = (table, cols, rows) =>
  `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES\n` +
  rows.map((r) => `  (${r.map(q).join(', ')})`).join(',\n') +
  ';\n';
const update = (table, col, pairs) =>
  `UPDATE "${table}" AS t SET "${col}" = v.text FROM (VALUES\n` +
  pairs.map(([code, text]) => `  (${q(code)}, ${q(text)})`).join(',\n') +
  `\n) AS v(code, text) WHERE t."code" = v.code;\n`;

const out =
  process.argv[2] === 'english'
    ? [
        update('ecc_subdomains', 'objective_en', catalog.subdomains.map((s) => [s.code, s.objectiveEn])),
        update('ecc_controls', 'text_en', catalog.controls.map((c) => [c.code, c.textEn])),
      ]
    : [
        insert(
          'ecc_domains',
          ['code', 'name_ar', 'name_en', 'sort'],
          catalog.domains.map((d, i) => [d.code, d.nameAr, d.nameEn, i + 1]),
        ),
        insert(
          'ecc_subdomains',
          ['code', 'domain_code', 'name_ar', 'name_en', 'objective_ar', 'sort'],
          catalog.subdomains.map((s, i) => [s.code, s.domain, s.nameAr, s.nameEn, s.objectiveAr, i + 1]),
        ),
        insert(
          'ecc_controls',
          ['code', 'subdomain_code', 'parent_code', 'text_ar', 'sort'],
          catalog.controls.map((c, i) => [c.code, c.subdomain, c.parent, c.textAr, i + 1]),
        ),
      ];

process.stdout.write(out.join('\n'));
