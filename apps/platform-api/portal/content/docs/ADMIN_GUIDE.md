# Pantheon Administrator Guide

The canonical administrator guide lives in the platform-api docs tree:

**[`apps/platform-api/docs/ADMIN_GUIDE.md`](https://github.com/salucallc/pantheon/blob/main/apps/platform-api/docs/ADMIN_GUIDE.md)**

It covers:

- Setup (`pnpm bootstrap`, `pnpm docker:up`, no license key)
- User management via SoulAuth (local, LDAP / AD, OIDC)
- Observability (audit streams, Prometheus, dashboard surfaces)
- Backup and restore (`pg_dump`, store-adapter notes)
- Troubleshooting

For the per-service install reference, see
[`apps/platform-api/deploy/INSTALL.md`](https://github.com/salucallc/pantheon/blob/main/apps/platform-api/deploy/INSTALL.md).
