# Demo Day resource budget

## Current development boundary

Use the `demo-day` branch of `acg0606/gift-portal-demo-day`.
The separate repository isolates source changes; it does not isolate provider
accounts, balances, databases, storage, or hosting quotas.

Until current account headroom and a separate Demo Day allowance are confirmed,
development must use existing example assets. Do not run new world generation,
AI photo descriptions, cloud uploads, migrations, scheduled workers, or deployments.

This is a working procedure, not an implemented or tested automatic spending cap.
The isolated local launcher is still pending implementation and verification.

## Read-only account check

Record the plan, billing period, usage, reset date, and remaining capacity from
each account's own usage dashboard. Review shared account totals, not only this
project.

| Service | Required evidence before using it |
| --- | --- |
| Supabase | Current storage and database size, billing-period storage average, cached and uncached egress, other projects sharing the organization |
| Vercel | Actual team plan, transfer, build usage, function invocations and CPU, AI Gateway balance and spend settings |
| ChatGPT Sites | Current account limits and remaining capacity across all Sites; a site count alone does not show headroom |
| ChatGPT / Codex | Remaining usage and reset time from the account dashboard; assistant work continues to consume usage even during local development |
| Tripo / World Labs | Current balance, cost of the selected operation, and a reserve for other work |

A current storage snapshot is not the billing-period average. A zero invoice
does not prove that a free account has unused capacity.

## Local rehearsal requirements

1. Use a clean checkout with no production credentials or linked Vercel project.
2. Do not use ordinary `dev` as proof of isolation: its middleware registers
   backend routes that can reach real providers.
3. Build with an empty environment-file directory and a sanitized process
   environment. Explicitly disable all generation flags.
4. Serve only the built static files on loopback. Return a disabled response
   for every API route; do not load the backend or run schedulers.
5. Enforce a Content Security Policy that blocks external connections, media,
   images and frames while allowing required local assets, blobs and WASM.
6. Use a clean browser profile and open the bundled routes:
   `#/generated/paris-example` and `#/generated/rio-example`.
7. Verify that no requests reach Supabase, AI Gateway, World Labs, Tripo or
   production hosting. Record the scope of the network check.

Local rendering can avoid those providers' usage; it does not eliminate
ChatGPT/Codex usage or consumption from the existing public application.

## Verification required for the launcher

Use fictitious credentials in both process variables and environment files to
prove they cannot enter the build. Check disabled API routes, loopback binding,
external-resource policy, static-file traversal protection, and existing-world
rendering. Do not describe the launcher as verified until these checks pass.

## Before a paid or hosted operation

Confirm current headroom and an explicit Demo Day allowance after preserving the
reserve for other projects. Use isolated credentials where available. Estimate
the operation's maximum cost, include retry behavior, record usage before and
after, and stop further operations when the allowance is exhausted.

The existing application's credit totals are accounting records, not spending
caps. The source migrations removed earlier internal generation and storage
caps. A provider balance check prevents an unaffordable submission; it does not
preserve a reserve for another project.

Do not copy production schedulers or credentials into a preview. The existing
cron routes and Supabase scheduler can otherwise process the same queue.

## Official references

- [Supabase storage accounting](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size)
- [Supabase egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
- [Vercel usage management](https://vercel.com/docs/pricing/manage-and-optimize-usage)
- [ChatGPT Sites limits](https://learn.chatgpt.com/docs/sites)
- [ChatGPT / Codex usage](https://learn.chatgpt.com/docs/pricing)
