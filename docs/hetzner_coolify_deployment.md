# Hetzner and Coolify Deployment Preparation

## Purpose and current status

The Marasi application is a Node.js service that builds the React client into `dist/public` and serves it through the Express server in `dist/index.js`. It is suitable for a Coolify application deployment with port **3000**, a persistent MySQL-compatible database, HTTPS, and a single public domain.

The application code has been validated locally, but it is **not yet safe to expose as the internal resort ERP** until its existing Manus-specific login is replaced with the selected self-hosted Google and Microsoft sign-in. Do not copy Manus OAuth or Forge credentials to Hetzner.

| Area | Production decision |
|---|---|
| Application source | `NewMux/Marasi-Alsawadi`, branch `main` |
| Build pack | Coolify **Nixpacks** for this plain Node.js application |
| Install command | `corepack enable && pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Start command | `pnpm start` |
| Exposed container port | `3000` |
| Health path | `GET /healthz` |
| Database | Dedicated MySQL or MariaDB service with persistent storage and backups |
| Domain and TLS | A single HTTPS ERP hostname, terminated by Coolify's proxy |
| Authentication | Google and Microsoft OpenID Connect; implementation waits for provider credentials |

## Coolify application setup

Create a **new Application** in the production Coolify environment and connect the GitHub repository. Select `main`, use Nixpacks, set the install, build, and start commands above, and expose port `3000`. Assign the final HTTPS ERP domain and turn on Force HTTPS. Configure `/healthz` as the health-check path after the first successful build.

Coolify runs applications as Docker containers and supports Nixpacks for ordinary Node.js applications. Its automatic deployment requires a GitHub App-based repository connection or a correctly configured webhook. [1] [2]

> Do not use a static-site build: the React client and the tRPC/Express API must be served by the same persistent Node.js application.

## Environment variables

Copy the variable names in [`.env.coolify.example`](../.env.coolify.example) into Coolify's environment-variable screen, but replace every placeholder directly in Coolify. Do not commit a `.env` file or secrets to GitHub.

| Variable | Required now | Purpose |
|---|---:|---|
| `NODE_ENV=production` | Yes | Runs Express in production mode. |
| `PORT=3000` | Yes | Matches the exposed Coolify port. |
| `DATABASE_URL` | Yes | Connection string for the dedicated MySQL/MariaDB database. |
| `JWT_SECRET` | Yes | Long random server-side signing key for application sessions. |
| `AUTH_BASE_URL` | Before OIDC rollout | Final HTTPS ERP URL, without a trailing slash. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Before OIDC rollout | Google web application credentials. |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Before OIDC rollout | Microsoft Entra web application credentials. |
| `MICROSOFT_TENANT_ID` | Before OIDC rollout | The Entra tenant ID or `organizations`. |
| `AUTH_ALLOWED_EMAILS` | Before OIDC rollout | Comma-separated first-wave staff allowlist. |

Mark server-only credentials as **runtime variables**. Build variables are not needed for these secrets. Coolify supports separate build-time and runtime variable settings; runtime-only secrets avoid appearing in build metadata. [3]

## Database preparation

Create a dedicated database, for example `marasi_erp`, and a least-privileged application user with access only to that database. Enable automated backups before importing any data. The existing sandbox migrations cannot be assumed to represent an empty Hetzner database baseline, so the production schema must be initialized and reviewed against `drizzle/schema.ts` during the Coolify deployment. Do not run an unreviewed destructive migration against a database containing resort records.

Before the first production launch, apply the reviewed schema to the fresh database in a controlled one-off job, verify the tables, create the initial administrator role mapping, and only then start the public application container.

## Google and Microsoft sign-in setup — deferred

After selecting the final domain, create one **Web application** with Google Cloud and one **Web application** with Microsoft Entra. Register these exact callback URLs:

```text
https://YOUR_ERP_DOMAIN/api/auth/google/callback
https://YOUR_ERP_DOMAIN/api/auth/microsoft/callback
```

Use the OAuth/OpenID Connect authorization-code flow with anti-forgery state protection and server-side client secrets. Google requires a registered redirect URI and client credentials; Microsoft requires an exact HTTPS redirect URI in a Web application registration. [4] [5]

The credentials must be entered directly into Coolify and supplied to this project only when the owner is ready to complete the provider integration. No placeholder credentials should be added to source control.

## Handover checklist

| Step | Owner | Status |
|---|---|---|
| Confirm final production domain | Resort owner | Pending |
| Create/confirm Hetzner server and Coolify project | Resort owner | Pending |
| Add MySQL/MariaDB resource, backup policy, and restricted app user | Resort owner / deployment operator | Pending |
| Create Google and Microsoft web OAuth applications | Resort owner | Pending |
| Provide credentials securely through the project secret form | Resort owner | Pending |
| Replace Manus-specific OAuth with self-hosted OIDC | Implementation | Pending |
| Apply reviewed schema to the fresh production database | Deployment operator | Pending |
| Deploy `main`, add domain, and verify `/healthz` | Deployment operator | Pending |

## References

[1] [Coolify Applications](https://coolify.io/docs/applications)

[2] [Coolify GitHub Auto Deploy](https://coolify.io/docs/applications/ci-cd/github/auto-deploy)

[3] [Coolify Environment Variables](https://coolify.io/docs/knowledge-base/environment-variables)

[4] [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)

[5] [Microsoft Entra Redirect URI guidance](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)
