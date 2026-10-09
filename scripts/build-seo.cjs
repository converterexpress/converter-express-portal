const fs = require('node:fs');
const path = require('node:path');

const origin = 'https://www.converterexpress.net';
const pages = require('../seo/pages.json');
const updated = '2026-10-09';
const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const pageLinks = pages.map((page) => `<a href="/${page.slug}">${esc(page.heading)}</a>`).join('');

const organization = {
  '@type': 'Organization', '@id': `${origin}/#organization`, name: 'Converter Express', url: `${origin}/`,
  logo: { '@type': 'ImageObject', '@id': `${origin}/#logo`, url: `${origin}/logo.png`, contentUrl: `${origin}/logo.png`, width: 420, height: 152 },
  image: { '@id': `${origin}/#logo` }, telephone: '+1-408-917-8099', email: 'orders@converterexpress.com',
  description: 'Wholesale catalytic converter supplier for automotive shops in Sacramento, Stockton, and the San Francisco Bay Area.',
  areaServed: [
    { '@type': 'City', name: 'Sacramento, California' },
    { '@type': 'City', name: 'Stockton, California' },
    { '@type': 'AdministrativeArea', name: 'San Francisco Bay Area, California' },
  ],
  contactPoint: { '@type': 'ContactPoint', telephone: '+1-408-917-8099', contactType: 'sales and customer service', areaServed: 'US-CA', availableLanguage: 'English' },
};
const website = {
  '@type': 'WebSite', '@id': `${origin}/#website`, url: `${origin}/`, name: 'Converter Express',
  description: 'Wholesale catalytic converters and shop delivery for California automotive professionals.',
  publisher: { '@id': `${origin}/#organization` }, inLanguage: 'en-US',
};
const icons = `<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"><link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest"><meta name="theme-color" content="#171b1f">`;
const style = `*{box-sizing:border-box}body{margin:0;background:#f3f3ef;color:#171a1e;font:16px/1.75 system-ui,sans-serif}a{color:inherit;text-underline-offset:5px}header,main,footer{max-width:1160px;margin:auto;padding:28px}header{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #d5d7d8}header>a{font-weight:850;text-decoration:none}nav{display:flex;flex-wrap:wrap;gap:22px}main{padding-top:80px;padding-bottom:80px}.kicker{color:#bf3612;letter-spacing:.15em;font-size:12px;font-weight:700}h1{font-size:clamp(36px,6vw,68px);line-height:1.05;letter-spacing:-.045em;max-width:850px;margin:22px 0}h2{font-size:26px;line-height:1.25;letter-spacing:-.025em;margin:0}.intro{max-width:780px;font-size:20px;color:#59606a;margin:28px 0 48px}.cta{display:inline-block;background:#d94218;color:white;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:650}section{display:grid;grid-template-columns:1fr 1.6fr;gap:48px;padding:38px 0;border-top:1px solid #d5d7d8}section p{margin:0 0 18px;color:#535b65}section a{font-weight:650}footer{border-top:1px solid #d5d7d8;font-size:14px}footer nav{margin:18px 0}footer small{color:#616773}@media(max-width:650px){header{flex-direction:column;gap:14px}main{padding-top:45px}section{grid-template-columns:1fr;gap:16px}.intro{font-size:18px}nav{gap:12px 22px}}`;

function metadata(title, description, url, heading) {
  const webpage = {
    '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description,
    isPartOf: { '@id': `${origin}/#website` }, about: { '@id': `${origin}/#organization` },
    primaryImageOfPage: { '@id': `${origin}/#social-image` }, dateModified: updated, inLanguage: 'en-US',
    ...(heading ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
  };
  const image = {
    '@type': 'ImageObject', '@id': `${origin}/#social-image`, url: `${origin}/og-image.jpg`, contentUrl: `${origin}/og-image.jpg`,
    width: 1200, height: 630, caption: 'Catalytic converter ready for shop delivery from Converter Express',
  };
  const graph = [organization, website, image, webpage];
  if (heading) graph.push({
    '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: heading, item: url },
    ],
  });
  return `<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><link rel="canonical" href="${url}">${icons}<meta property="og:locale" content="en_US"><meta property="og:type" content="website"><meta property="og:site_name" content="Converter Express"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${origin}/og-image.jpg"><meta property="og:image:secure_url" content="${origin}/og-image.jpg"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Catalytic converter ready for shop delivery from Converter Express"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${origin}/og-image.jpg"><meta name="twitter:image:alt" content="Catalytic converter ready for shop delivery from Converter Express"><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
}

module.exports = function buildSeo(output) {
  for (const page of pages) {
    const url = `${origin}/${page.slug}`;
    fs.writeFileSync(path.join(output, `${page.slug}.html`), `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${metadata(page.title, page.description, url, page.heading)}<style>${style}</style></head><body><header><a href="/">CONVERTER EXPRESS</a><nav aria-label="Main navigation"><a href="/catalytic-converters">Converters</a><a href="/shop-delivery">Delivery</a><a href="/about-converter-express">About</a><a href="/#/login">Shop sign in</a></nav></header><main><div class="kicker">${page.kicker}</div><h1>${page.heading}</h1><p class="intro">${page.intro}</p><p><a class="cta" href="/#/register">Get $50 off your first order →</a></p>${page.sections.map((section) => `<section><h2>${section.heading}</h2><div><p>${section.text}</p><a href="${section.link}">${section.label} →</a></div></section>`).join('')}</main><footer><strong>Converter Express</strong><nav aria-label="More about Converter Express">${pageLinks}</nav><small>Serving automotive shops in Sacramento, Stockton, and the Bay Area. Call <a href="tel:+14089178099">(408) 917-8099</a>.</small></footer></body></html>`);
  }
  const homeTitle = 'Wholesale Catalytic Converters for Auto Shops | Converter Express';
  const homeDescription = 'Wholesale catalytic converters with free same-day delivery on in-stock parts to auto shops in Sacramento, Stockton and the Bay Area. Search by vehicle or part number.';
  for (const file of ['index.html', 'converter-express_1.html']) {
    const target = path.join(output, file);
    let html = fs.readFileSync(target, 'utf8').replace('<html>', '<html lang="en-US">').replace('<title>Converter Express Demo</title>', metadata(homeTitle, homeDescription, `${origin}/`));
    html = html.replace('<main id="app"></main>', `<main id="app"><section style="max-width:1100px;margin:auto;padding:48px 24px"><h1>Catalytic converters delivered to your shop</h1><p>Converter Express supplies wholesale catalytic converters to automotive shops in Sacramento, Stockton, and the Bay Area. Search by vehicle or part number. In-stock parts qualify for free same-day shop delivery, while out-of-stock parts have estimated delivery in 1–2 business days from LA.</p><p>Call <a href="tel:+14089178099">(408) 917-8099</a> for part and delivery help.</p><nav aria-label="Learn about Converter Express">${pageLinks}</nav></section></main>`);
    fs.writeFileSync(target, html);
  }
  const sitemapUrls = [{ loc: `${origin}/`, priority: '1.0', changefreq: 'weekly' }, ...pages.map((page) => ({ loc: `${origin}/${page.slug}`, priority: '0.8', changefreq: 'monthly' }))];
  fs.writeFileSync(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((entry) => `  <url><loc>${entry.loc}</loc><lastmod>${updated}</lastmod><changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`).join('\n')}\n</urlset>\n`);
  fs.writeFileSync(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\nHost: www.converterexpress.net\n`);
};
