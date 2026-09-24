# Mizan · منصة إدارة الامتثال لـ ECC-2:2024

An Arabic-first, RTL compliance-management platform for the Saudi **Essential Cybersecurity Controls (ECC-2:2024)** issued by the National Cybersecurity Authority (NCA).

A government entity's cybersecurity manager opens one dashboard and, in seconds, sees where they stand: the compliance score, the weakest domain, and what needs action right now — overdue controls, gaps, expiring evidence, the next auditor visit. The platform surfaces problems on its own instead of leaving them buried in a table.

> **Independent project.** Not affiliated with or endorsed by the NCA. It does not use the Authority's name, branding, or identity, and the compliance percentage it computes is an internal indicator, not the Authority's methodology — stated as such in the UI and in every report.

---

## At a glance

| | |
|---|---|
| **200** ECC controls & subcontrols | **103** automated tests, all green |
| **PostgreSQL Row-Level Security** tenant isolation | **9** screens · Arabic + English · light + dark |
| Mandatory **two-step (TOTP)** auth | **GitHub Actions** CI on every change |

---

## The problem

Every Saudi government entity must comply with 108 mandatory cybersecurity controls and prove it to an auditor. In practice the status lives in spreadsheets: gaps go unnoticed, evidence quietly expires, and no one can answer *"where do we stand?"* on demand.

Mizan's guiding principle is that **the platform speaks up on its own** — overdue controls, gaps and expiring evidence surface to the right person instead of waiting to be filtered out of a table. A manager opens one dashboard and, in seconds, reads the score, the weakest domain, and the next thing to do.

---

## What it does

- **The full ECC-2:2024 catalog** — 4 domains, 28 subdomains, 108 main controls and 92 subcontrols, transcribed verbatim from the official Arabic PDF and matched to the official English text.
- **Track compliance** — set each control's status, owner and due date; the dashboard shows the score, a control map, and results per domain.
- **Evidence** — upload proof files against controls (content-checked, not just by extension), with validity dates and expiry alerts.
- **Remediation plans** — steps on each control, each with an owner and a due date.
- **Alerts** — derived live from the current state (overdue, non-compliant, expiring evidence, upcoming auditor visit), so an alert disappears the moment its cause is fixed.
- **Reports** — a printable / save-as-PDF compliance report.
- **Audit log** — every change recorded, append-only, enforced by the database.
- **Roles** — Admin, Control Owner, Executive (read-only), Auditor (read + comment).
- **Bilingual** — Arabic (RTL, default) and English (LTR), with a calm light and dark theme.

---

## Engineering highlights

The parts I'd point a reviewer to.

### Multi-tenant isolation, enforced by the database — not just the code
Each entity's data is isolated with **PostgreSQL Row-Level Security**. The API connects as a role that is `NOSUPERUSER NOBYPASSRLS`, so even a query that forgets its `WHERE` clause returns nothing from another entity. Every request sets `app.entity_id` in a transaction-local setting that RLS policies key on. The isolation is proven by tests that **fail when RLS is disabled** — the most important test in the project.

### Authentication built for a government context
- scrypt password hashing; session tokens stored only as SHA-256 hashes (a database leak doesn't leak live sessions).
- **Mandatory TOTP** two-step verification for everyone, with replay protection.
- MFA secrets encrypted at rest (AES-256-GCM).
- Database-backed sessions in an httpOnly, SameSite=Lax, Secure-in-production cookie; revocable instantly.
- Account lockout after repeated failures; identical error for an unknown email and a wrong password.
- CSRF defended by JSON-only writes + an Origin check + SameSite cookies.
- Accounts by Admin invitation only; no open sign-up.
- HTTP security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS).

### Append-only audit log
The `audit_log` table rejects `UPDATE` and `DELETE` at the database level — even the superuser can't rewrite history.

### Arabic-first RTL as a system, not an afterthought
Logical CSS properties only; numbers and control codes forced to Latin, tabular and LTR-isolated inside RTL text; direction-bearing icons mirrored; a design system (`DESIGN.md`) with tokens, a locked visual direction, and a WCAG-AA light **and** dark theme.

### Tested and gated
**103 automated tests** (22 unit + 81 end-to-end) covering tenant isolation, auth, every feature's permissions, and content-checked uploads. **GitHub Actions CI** runs the whole suite against a real PostgreSQL with the same roles as production on every pull request. Every feature shipped on its own branch and PR.

---

## Tech stack

| Layer | Choice |
|---|---|
| Web | Next.js 16 (App Router), Tailwind CSS v4, next-intl 4 |
| API | NestJS 12 (TypeScript, ESM), Vitest |
| Database | PostgreSQL 17, Prisma 7 ORM, Row-Level Security |
| Auth | scrypt, RFC 6238 TOTP, AES-256-GCM, DB sessions |
| Tooling | Docker Compose, GitHub Actions, oxlint / ESLint |

## Repository layout

```
api/    NestJS API — auth, controls, evidence, tasks, alerts, audit-log, visits, entity
        prisma/    schema, migrations (RLS policies, append-only triggers), the ECC catalog
web/    Next.js app — one route per screen under app/[locale], components, i18n
db/     database role bootstrap (owner + non-bypass app role)
DESIGN.md / PRODUCT.md    design system and product context
```

## Running locally

Prerequisites: Node.js 24, Docker.

```bash
# 1. Database (PostgreSQL 17 in Docker, with the two roles)
cp .env.example .env            # set the two DB passwords
docker-compose up -d

# 2. API  (http://localhost:3001)
cd api
cp .env.example .env            # DB URLs, MFA_ENCRYPTION_KEY (openssl rand -base64 32), WEB_ORIGIN
npm install
npm run db:migrate
npm run create-entity -- --name "الجهة" --name-en "The Entity" --admin-email admin@example.gov.sa
npm run start:dev

# 3. Web  (http://localhost:3000)
cd ../web
cp .env.example .env            # API_ORIGIN
npm install
npm run dev
```

## Tests

```bash
cd api
npm test            # unit
npm run test:e2e    # end-to-end (needs the test database)
```

---

## Status

The platform is feature-complete for a first release: authentication, the full controls catalog, evidence, remediation, alerts, reports, the audit log, entity settings and auditor visits, in both languages and both themes, all tested and behind CI.

Open decisions (product, not code): hosting (government data usually must stay in-Kingdom), the final project name, and in-platform AI features. Sign-in via Nafath (the national SSO) is planned as a second method.
