# TreatStory documentation

This is the navigation index for maintainers. Keep deployment procedures, regression evidence and operational instructions in version control even when they are not imported by the app.

## Start here

- [Marketplace architecture](multi-vendor-architecture.md) and [project blueprint](blueprint.md)
- [Production hardening and release checklist](production-hardening-rollout.md)
- [Firebase dashboard rollout](dashboard-rollout.md), [seller product / order rollout](seller-product-order-rollout.md) and [order workflows](order-workflow-release.md)
- [Transactional email configuration](email-setup.md) and [Cloudinary media configuration](cloudinary-setup.md)
- [SEO rollout](seo-rollout.md) and [product SKU search](product-sku-search.md)

## Support and security

- [Customer support](customer-support.md)
- [Encrypted support implementation status](support-implementation-status.md)
- [Production messaging / security review](support-security-review.md) and [device acceptance criteria](support-device-acceptance.md)
- [Encrypted support design](support-encryption.md) and [multi-device strategy](support-multidevice-design.md)

Encrypted support infrastructure is retained for future work but disabled until the production security and device release gates are satisfied.

## Tests and past evidence

- [Audit findings and results](audits/README.md)
- [Reproduce local emulated audits](audits/RUNBOOK.md)
- [14 November 2026 hardening results](audits/2026-11-14/README.md)
- `tests/`: Next.js/Firebase regression and emulator tests; `scripts/audit/`: isolated load, browser and security tools.

The checked-in `docs/audits/` files are historical evidence, **not** runtime garbage. Keep the reports and measurements so performance/security comparisons remain reproducible.

## Maintenance guidelines

1. Remove a module only after checking imports across app, scripts and tests; Next.js routes and Firebase rules may be entrypoints without imports.
2. Preserve PWA/Apple startup images and hashed icon/hero outputs. A cached manifest may continue referencing an earlier asset path.
3. Preserve Firebase/Storage rules, indexes, notification infrastructure, migration scripts and `apps-script/`; Vercel builds do not replace those services.
4. Do not commit local `.idx/` IDE configuration, `.modified` markers, `.next/`, `node_modules/`, test secrets or generated runtime credentials.
5. Make cleanup changes in one PR and require the build, emulator/security and encrypted-support CI checks before merge. Never remove release-gate documentation merely because chat is disabled.
