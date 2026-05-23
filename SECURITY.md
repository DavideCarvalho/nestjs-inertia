# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.9.x   | ✅ active |
| 0.8.x   | ✅ active (Inertia v2 protocol) |
| < 0.8   | ❌        |

## Reporting a vulnerability

Please report security issues privately to **davi@goflip.ai** (or via GitHub
Security Advisories at https://github.com/DavideCarvalho/nestjs-inertia/security/advisories/new).

We aim to:
- Acknowledge receipt within 48 hours
- Provide an initial assessment within 7 days
- Ship a fix in the next patch release, with credit if desired

Do NOT report security issues via public GitHub issues.

## Automated scanning

This repo runs Trivy + Grype on every push, pull request, and weekly cron.
See `.github/workflows/security.yml`. Results land in the GitHub Security tab.

The full audit report from v0.9 alpha is at [`SECURITY-AUDIT.md`](./SECURITY-AUDIT.md).
