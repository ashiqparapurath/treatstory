# TreatStory SEO rollout checklist

## Technical changes implemented in this branch
- Public `/robots.txt` and `/sitemap.xml` routes. Sitemap includes indexable marketing pages, active storefronts, published marketplace products and public legacy products (paginated in 500-document batches, capped at 15,000 records per collection).
- Unique canonical SEO metadata for the homepage, product collection, new arrivals, brand story, and seller application page.
- Server-rendered public product and seller storefront content, with matching metadata and schema.org `Product`/`Store` JSON-LD. Product offers are only emitted when a public positive price is available; fake ratings, reviews and availability claims are not added.
- `WebSite` and `Organization` schema, without invented contact addresses, social URLs or Google verification tokens.
- Noindex metadata for key account, checkout and admin screens; Vercel preview deployments return `X-Robots-Tag: noindex, nofollow`. Existing PWA icon branding is unchanged.

## Required launch steps (not automatable from repository changes)
1. Confirm the permanent production domain. Set Vercel `APP_URL` to that exact **HTTPS** origin. The current default is `https://treatstory.vercel.app`. Avoid letting preview URLs become canonical. Use 301 redirects to one canonical hostname if a custom domain is added.
2. Publish and inspect `/robots.txt` and `/sitemap.xml` on the final public production domain. If server Firebase credentials are not configured, the sitemap falls back to static pages; verify live published products and active stores appear before submitting to Google.
3. Verify the site in **Google Search Console**, submit `/sitemap.xml`, inspect a few product/store URLs using URL Inspection, and monitor **Pages** indexing, **Search results** impressions/clicks/query terms, and Core Web Vitals. This requires the domain owner's action; this PR does not create a Google Search Console property or verify ownership.
4. Check pages using Google's Rich Results Test and PageSpeed Insights. Test homepage, marketplace collection, a published product, active store, and a draft/inactive URL. Confirm drafts and non-public routes do not expose private content.
5. Consider **Google Merchant Center** once policies, delivery areas, return/refund/contact information, stock/price accuracy and merchant eligibility are confirmed. A merchant product feed and Google Shopping integration are not part of this PR.
6. Write useful, original product descriptions and readable names that shoppers actually search for (for example, homemade birthday cakes, handcrafted gifts, art, regional maker names). Use real photographs with descriptive alt text and reliable availability. Do not use keyword stuffing, generated doorway pages, fake reviews or unsupported local-business locations.
7. Publish genuinely useful category landing pages and maker stories when enough real products and editorial material exist. Link from those pages to relevant products and seller stores with real anchor links.
8. Compare search impressions, clicks, indexing coverage, and sales before and after release. Rankings and traffic increases are **not guaranteed**; Google indexing takes time and depends on site quality, authority and competition.

## Known limitations
- Current dynamic sitemap paginates up to 15,000 records from each of the three public collections, keeping the total under the 50,000-URL Google sitemap limit. Split sitemaps with an index if inventory exceeds this cap; verify the sitemap doesn't time out under larger catalogs.
- A server Firebase error can lead to generic metadata or a static-only sitemap instead of live product details. Monitor errors and ensure server credentials are configured, never expose service accounts to browser bundles.
- Existing marketplace search/filter UI is primarily client-rendered; Google can reliably crawl server-rendered canonical product/store URLs, but a deeper server-rendered category/navigation experience remains a content project.
- Public stores currently use `/shop/{sellerId}` URLs. Descriptive slug URLs are a separate compatibility/migration task; don't change canonical URLs without redirects.
- The experimental encrypted-support chat remains **disabled by default** behind `NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED`, and the existing support-ticket system stays active. Do **not** enable that flag in production until secure multi-device enrollment, recovery and independent cryptography review are complete.

## Verification status (2026-11-13)

- Repository SEO code is in draft PR #15 and is not deployed to production.
- External requests to `https://treatstory.vercel.app`, `/robots.txt`, and `/sitemap.xml` could not be completed from the audit environment. **This does not prove the site is down or that Google cannot index it**; use a normal browser, Search Console URL Inspection and Vercel domain/access settings for a definitive live check.
- Google Search Console property verification, sitemap submission and indexing reports require connected account access. No domain verification or sitemap submission is claimed in this PR.
- The SEO implementation may be merged while experimental E2EE remains disabled; leave the flag unset in Vercel. Existing encrypted pilot conversations remain stored, but are hidden from the legacy ticket responder to avoid accidentally handling them in plaintext. Do not delete their keys.
