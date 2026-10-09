# Search visibility

Canonical website: https://www.converterexpress.net

The build creates `/sitemap.xml`, `/robots.txt`, and three public HTML pages: `/catalytic-converters`, `/shop-delivery`, and `/about-converter-express`. These pages explain the supplier, catalog, vehicle lookup, ordering, warranty, and delivery service using the business details supplied by the owner. They are linked from the homepage footer and each other, and include unique titles, descriptions, canonical URLs, Open Graph and X/Twitter metadata, breadcrumbs, and Organization, WebSite, WebPage, and ImageObject structured data. No invented address, ratings, stock levels, or product prices are used.

The public build also includes a complete favicon set, Apple touch icon, web app manifest, and a 1200 × 630 social sharing image. The canonical host is the `www` version of `converterexpress.net`; all legacy and apex domains should permanently redirect to it.

The homepage includes initial HTML content for crawlers and visitors before JavaScript runs. The interactive portal still uses hash routes. Private screens and hash URLs are not separate sitemap entries; authentication and database permissions remain responsible for protecting private data.

After deployment, verify ownership of this website in Google Search Console and submit `https://www.converterexpress.net/sitemap.xml`. That account verification has not been performed by this change. Check indexing, crawl errors, Core Web Vitals, and rich-result validation there. A sitemap aids discovery; it does not guarantee indexing or rankings. When the canonical domain changes, update the origin in `scripts/build-seo.cjs`, tests, hosting redirects, and Search Console together.

Update public copy in `seo/pages.json`. Run `node tests/static-build.cjs` and `node tests/seo.cjs` after editing. The build intentionally publishes only allowlisted application assets and generated public SEO files.

First-order offer: WELCOME50, $50 amount discount, first eligible order only, capped at the merchandise subtotal. The backend maps legacy WELCOME100 requests from old tabs to the current offer. Existing order records retain their original totals and discount labels.
