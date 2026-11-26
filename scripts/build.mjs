// Builds ate10.com's public feed from the database: the home grid, a page per city and per dish, and the sitemap.
//
// Reads public.web_feed (ate repo, preview/supabase/web-feed.sql): only real restaurants, no one's name or account,
// nothing removed, hidden or from a deleted account. Run by .github/workflows/build.yml every 30 minutes; by hand:
//   node scripts/build.mjs                 (from the database)
//   node scripts/build.mjs --data rows.json  (from a saved copy of the view's rows)
//
// What it writes (and rewrites in full each time, so a post taken down disappears): index.html, city/*, dish/*,
// sitemap.xml. Everything else in the repo (privacy, terms, support, 404, the app-link file) it leaves alone.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://ate10.com";
const SUPABASE = "https://tadlweejyjxctzihohon.supabase.co";
// The app's publishable key (it ships in the app): it can read web_feed and nothing private.
const KEY = "sb_publishable_oyaHq5pJIMTuMYhTv4ir7g_Zl7XrA0J";
const APP_ID = "6818437642";
const APP_URL = `https://apps.apple.com/us/app/ate10/id${APP_ID}`;
// Apple's own badge, as Apple serves it for embedding (not redrawn or changed).
const BADGE = "https://tools.applemarketingtools.com/api/badges/download-on-the-app-store/black/en-us?size=250x83";

// MARK: Data

async function load() {
  const at = process.argv.indexOf("--data");
  if (at > 0) return JSON.parse(await readFile(process.argv[at + 1], "utf8"));
  const url = `${SUPABASE}/rest/v1/web_feed?select=*&order=created_at.desc&limit=5000`;
  const res = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`web_feed: ${res.status} ${await res.text()}`);
  return res.json();
}

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function tidy(rows) {
  return rows
    .map((r) => ({
      id: r.id,
      at: r.created_at,
      dish: r.dish_id,
      name: clean(r.name),
      place: clean(r.place),
      city: clean(r.city),
      region: clean(r.region),
      hood: clean(r.neighborhood),
      lat: Number(r.lat),
      lng: Number(r.lng),
      photo: String(r.photo ?? ""),
      rating: r.rating == null ? null : Number(r.rating),
      frame: r.frame || "",
    }))
    .filter((p) => p.id && p.dish && p.name && p.place && p.city && /^https:\/\//.test(p.photo) && isFinite(p.lat) && isFinite(p.lng));
}

// MARK: Little helpers

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const slug = (s) => clean(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cityName = (p) => (p.region ? `${p.city}, ${p.region}` : p.city);
const cityKey = (p) => slug(p.region ? `${p.city} ${p.region}` : p.city);
const label = (r) => (r == null ? "" : r.toFixed(1));
const month = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
// The photo's shape, width over height: the app's "4:3" is a tall photo (3 wide, 4 high), "wide" a landscape one.
const aspect = (frame) => (frame === "4:3" ? 3 / 4 : frame === "wide" ? 4 / 3 : 1);

// The app's score colours (Design/Theme.swift, ScoreTone): lavender, orchid, bubblegum at 1, 3 and 5, then
// coral, peach, mango, citron and lime to 10, blended between.
function tone(r) {
  const low = [[185, 166, 255], [224, 140, 240], [255, 111, 181]];
  const stops = [[255, 111, 181], [255, 126, 138], [255, 159, 90], [255, 203, 69], [215, 236, 62], [166, 232, 58]];
  let a, b, f;
  if (r < 5) {
    const t = Math.min(2, Math.max(0, (r - 1) / 2)), n = Math.min(1, Math.floor(t));
    [a, b, f] = [low[n], low[n + 1], t - n];
  } else {
    const t = Math.min(5, Math.max(0, r - 5)), n = Math.min(4, Math.floor(t));
    [a, b, f] = [stops[n], stops[n + 1], t - n];
  }
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(",")})`;
}

const score = (r, cls = "score") => (r == null ? "" : `<span class="${cls}" style="background:${tone(r)}">${label(r)}</span>`);
const maps = (p) => `https://maps.apple.com/?q=${encodeURIComponent(p.place)}&ll=${p.lat},${p.lng}`;

// MARK: Page pieces

function head({ title, description, path, image, root, extra = "", appArg }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${path}">
<meta name="apple-itunes-app" content="app-id=${APP_ID}${appArg ? `, app-argument=${esc(appArg)}` : ""}">
<meta property="og:site_name" content="Ate10">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${path}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="icon" href="${root}assets/icon.png">
<link rel="apple-touch-icon" href="${root}assets/icon.png">
<link rel="preload" href="${root}fonts/GeneralSans-Medium.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${root}assets/site.css">
${extra}
</head>
<body>
<header class="bar">
  <a class="logo" href="${root}" aria-label="Ate10 home">ate<span class="ten">10</span></a>
  <a class="store" href="${APP_URL}"><img src="${BADGE}" alt="Download on the App Store" width="120" height="40"></a>
</header>
`;
}

function foot(root) {
  return `<footer class="foot">
  <a href="${APP_URL}">Get Ate10</a>
  <a href="${root}privacy.html">Privacy</a>
  <a href="${root}terms.html">Terms</a>
  <a href="${root}support.html">Support</a>
</footer>
<div class="modal" id="modal" hidden>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="m-name">
    <button class="x" type="button" aria-label="Close">&times;</button>
    <div class="m-photo"><img id="m-img" alt=""><span id="m-score" class="score big"></span></div>
    <div class="m-body">
      <h2 id="m-name"></h2>
      <p id="m-where" class="where"></p>
      <p id="m-when" class="when"></p>
      <div class="acts">
        <a id="m-maps" class="btn" target="_blank" rel="noopener">Directions</a>
        <a class="store" href="${APP_URL}"><img src="${BADGE}" alt="Download on the App Store" width="120" height="40"></a>
      </div>
    </div>
  </div>
</div>
<script src="${root}assets/site.js" defer></script>
</body>
</html>
`;
}

function tile(p, root) {
  const w = 600, h = Math.round(w / aspect(p.frame));
  return `<a class="tile" href="${root}dish/${p.dish}/" data-a="${aspect(p.frame).toFixed(4)}" data-name="${esc(p.name)}" data-place="${esc(p.place)}" data-city="${esc(cityName(p))}" data-score="${label(p.rating)}" data-tone="${p.rating == null ? "" : tone(p.rating)}" data-photo="${esc(p.photo)}" data-maps="${esc(maps(p))}" data-when="${esc(month(p.at))}"><img src="${esc(p.photo)}" alt="${esc(p.name)} at ${esc(p.place)}" width="${w}" height="${h}" loading="lazy" decoding="async"><span class="cap"><b>${esc(p.name)}</b><span>${esc(p.place)}</span></span>${score(p.rating)}</a>`;
}

const grid = (posts, root) => `<div class="grid" id="grid">${posts.map((p) => tile(p, root)).join("")}</div>`;

function chips(cities, root, on) {
  return `<nav class="chips" aria-label="Cities"><a href="${root}"${on ? "" : ' aria-current="page"'}>Everywhere</a>${cities
    .map((c) => `<a href="${root}city/${c.key}/"${c.key === on ? ' aria-current="page"' : ""}>${esc(c.name)}</a>`)
    .join("")}</nav>`;
}

// MARK: Pages

function homePage(posts, cities) {
  const root = "./";
  return (
    head({
      title: "Ate10 · What people are eating",
      description: "Real dishes rated by real people at restaurants near you. See what to order, then get Ate10 to rate your own.",
      path: "/",
      image: posts[0]?.photo,
      root,
    }) +
    `<main>
<section class="intro"><h1>What people are eating</h1><p>Dishes rated on Ate10, newest first.</p></section>
${chips(cities, root)}
${grid(posts, root)}
</main>
` +
    foot(root)
  );
}

function cityPage(c, posts, cities) {
  const root = "../../";
  const rated = posts.filter((p) => p.rating != null).length;
  return (
    head({
      title: `Best dishes in ${c.name} · Ate10`,
      description: `${posts.length} dish${posts.length === 1 ? "" : "es"} rated in ${c.name} on Ate10: what to order at ${[...new Set(posts.map((p) => p.place))].slice(0, 3).join(", ")} and more.`,
      path: `/city/${c.key}/`,
      image: posts[0]?.photo,
      root,
    }) +
    `<main>
<section class="intro"><h1>Dishes in ${esc(c.name)}</h1><p>${rated} rating${rated === 1 ? "" : "s"} from people eating in ${esc(c.city)}.</p></section>
${chips(cities, root, c.key)}
${grid(posts, root)}
</main>
` +
    foot(root)
  );
}

function dishPage(d, more) {
  const root = "../../";
  const p = d.posts[0];
  const rated = d.posts.filter((x) => x.rating != null);
  const avg = rated.length ? rated.reduce((s, x) => s + x.rating, 0) / rated.length : null;
  const where = [p.place, p.hood, cityName(p)].filter(Boolean).join(" · ");
  const ld = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: p.place,
    address: { "@type": "PostalAddress", addressLocality: p.city, ...(p.region ? { addressRegion: p.region } : {}) },
    geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng },
    image: d.posts.map((x) => x.photo).slice(0, 5),
    hasMenu: { "@type": "Menu", hasMenuSection: { "@type": "MenuSection", hasMenuItem: { "@type": "MenuItem", name: p.name } } },
  };
  const title = `${p.name} at ${p.place}, ${cityName(p)} · Ate10`;
  const description = `${p.name} at ${p.place} in ${cityName(p)}${avg != null ? `, rated ${label(avg)} out of 10` : ""} on Ate10. See the photos, then get directions.`;
  return (
    head({
      title,
      description,
      path: `/dish/${p.dish}/`,
      image: p.photo,
      root,
      appArg: `${SITE}/dish/${p.dish}`,
      extra: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
    }) +
    `<main class="dish">
<article>
  <div class="hero" style="aspect-ratio:${aspect(p.frame)}"><img src="${esc(p.photo)}" alt="${esc(p.name)} at ${esc(p.place)}">${score(avg, "score big")}</div>
  <h1>${esc(p.name)}</h1>
  <p class="where">${esc(where)}</p>
  <p class="when">${avg != null ? `${label(avg)} average from ${rated.length} rating${rated.length === 1 ? "" : "s"} · ` : ""}Rated ${esc(month(p.at))}</p>
  <div class="acts">
    <a class="btn" href="${esc(maps(p))}" target="_blank" rel="noopener">Directions</a>
    <a class="store" href="${APP_URL}"><img src="${BADGE}" alt="Download on the App Store" width="120" height="40"></a>
  </div>
  ${d.posts.length > 1 ? `<h2>More photos</h2>${grid(d.posts.slice(1), root)}` : ""}
</article>
${more.length ? `<h2>More in ${esc(p.city)}</h2>${grid(more, root)}` : ""}
</main>
` +
    foot(root)
  );
}

// MARK: Build

async function main() {
  const posts = tidy(await load());
  if (!posts.length) throw new Error("web_feed returned no posts: not replacing the site with an empty one");

  // Cities, most posts first.
  const byCity = new Map();
  for (const p of posts) {
    const key = cityKey(p);
    if (!byCity.has(key)) byCity.set(key, { key, name: cityName(p), city: p.city, posts: [] });
    byCity.get(key).posts.push(p);
  }
  const cities = [...byCity.values()].sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name));

  // Dishes, each with its posts (newest first, as the rows come).
  const byDish = new Map();
  for (const p of posts) {
    if (!byDish.has(p.dish)) byDish.set(p.dish, { id: p.dish, posts: [] });
    byDish.get(p.dish).posts.push(p);
  }

  await rm(join(ROOT, "city"), { recursive: true, force: true });
  await rm(join(ROOT, "dish"), { recursive: true, force: true });

  await writeFile(join(ROOT, "index.html"), homePage(posts, cities));
  for (const c of cities) {
    await mkdir(join(ROOT, "city", c.key), { recursive: true });
    await writeFile(join(ROOT, "city", c.key, "index.html"), cityPage(c, c.posts, cities));
  }
  for (const d of byDish.values()) {
    const key = cityKey(d.posts[0]);
    const more = byCity.get(key).posts.filter((p) => p.dish !== d.id).slice(0, 12);
    await mkdir(join(ROOT, "dish", d.id), { recursive: true });
    await writeFile(join(ROOT, "dish", d.id, "index.html"), dishPage(d, more));
  }

  const latest = (list) => list.map((p) => p.at).sort().pop();
  const urls = [
    { loc: "/", at: latest(posts) },
    ...cities.map((c) => ({ loc: `/city/${c.key}/`, at: latest(c.posts) })),
    ...[...byDish.values()].map((d) => ({ loc: `/dish/${d.id}/`, at: latest(d.posts) })),
  ];
  await writeFile(
    join(ROOT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${SITE}${u.loc}</loc><lastmod>${u.at.slice(0, 10)}</lastmod></url>`)
      .join("\n")}\n</urlset>\n`,
  );
  console.log(`Built ${posts.length} posts, ${byDish.size} dishes, ${cities.length} cities.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
