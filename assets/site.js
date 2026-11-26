// ate10.com: lays the grid into columns (each tile into the shortest, as the app's Search does) and opens a post in
// a modal that has the dish page's own address, so it can be shared, reloaded or found by search.
(function () {
  "use strict";

  // MARK: Masonry

  function columns(width) {
    return width >= 1360 ? 5 : width >= 1024 ? 4 : width >= 720 ? 3 : 2;
  }

  function lay(grid) {
    var tiles = grid._tiles || (grid._tiles = Array.prototype.slice.call(grid.querySelectorAll(":scope > .tile, :scope > .col > .tile")));
    var n = columns(grid.clientWidth || window.innerWidth);
    if (grid._n === n) return;
    grid._n = n;
    var cols = [], heights = [];
    for (var i = 0; i < n; i++) {
      var c = document.createElement("div");
      c.className = "col";
      cols.push(c);
      heights.push(0);
    }
    tiles.forEach(function (t) {
      var a = parseFloat(t.getAttribute("data-a")) || 1, k = 0;
      for (var j = 1; j < n; j++) if (heights[j] < heights[k] - 0.01) k = j;
      cols[k].appendChild(t);
      heights[k] += 1 / a + 0.04;
    });
    grid.textContent = "";
    cols.forEach(function (c) { grid.appendChild(c); });
    grid.classList.add("laid");
  }

  var grids = document.querySelectorAll(".grid");
  function layAll() { grids.forEach(lay); }
  layAll();
  var t;
  window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(layAll, 120); });

  // MARK: Continuous corners
  // The app's corners (SwiftUI's .continuous): a squircle, its curve easing into the straight edge instead of a
  // circle's quarter meeting it at a kink. CSS only draws circular corners, so each tile, photo and sheet is clipped
  // to the squircle drawn for its size (Figma's corner smoothing, 60%, the iOS look), redrawn when its size changes.

  function corner(r, budget) {
    var smoothing = 0.6, rad = Math.PI / 180;
    r = Math.min(r, budget);
    var p = Math.min((1 + smoothing) * r, budget);
    if (p < (1 + smoothing) * r) smoothing = Math.max(0, p / r - 1);
    var arc = 90 * (1 - smoothing);
    var arcLen = Math.sin((arc / 2) * rad) * r * Math.SQRT2;
    var alpha = (90 - arc) / 2, beta = 45 * smoothing;
    var p3p4 = r * Math.tan((alpha / 2) * rad);
    var c = p3p4 * Math.cos(beta * rad), d = c * Math.tan(beta * rad);
    var b = (p - arcLen - c - d) / 3, a = 2 * b;
    return { a: a, b: b, c: c, d: d, p: p, L: arcLen, r: r };
  }

  function squircle(w, h, radius) {
    var k = corner(radius, Math.min(w, h) / 2), a = k.a, b = k.b, c = k.c, d = k.d, p = k.p, L = k.L, R = k.r;
    var n = function (x) { return Math.round(x * 100) / 100; };
    return ["M", n(w - p), 0,
      "c", n(a), 0, n(a + b), 0, n(a + b + c), n(d), "a", n(R), n(R), 0, 0, 1, n(L), n(L), "c", n(d), n(c), n(d), n(b + c), n(d), n(a + b + c),
      "L", n(w), n(h - p),
      "c", 0, n(a), 0, n(a + b), n(-d), n(a + b + c), "a", n(R), n(R), 0, 0, 1, n(-L), n(L), "c", n(-c), n(d), n(-(b + c)), n(d), n(-(a + b + c)), n(d),
      "L", n(p), n(h),
      "c", n(-a), 0, n(-(a + b)), 0, n(-(a + b + c)), n(-d), "a", n(R), n(R), 0, 0, 1, n(-L), n(-L), "c", n(-d), n(-c), n(-d), n(-(b + c)), n(-d), n(-(a + b + c)),
      "L", 0, n(p),
      "c", 0, n(-a), 0, n(-(a + b)), n(d), n(-(a + b + c)), "a", n(R), n(R), 0, 0, 1, n(L), n(-L), "c", n(c), n(-d), n(b + c), n(-d), n(a + b + c), n(-d),
      "Z"].join(" ");
  }

  var RADII = { tile: 28, hero: 38, sheet: 32 };
  function shape(el) {
    var r = RADII[el.dataset.sq], w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    el.style.clipPath = "path('" + squircle(w, h, r) + "')";
    el.style.borderRadius = "0";
  }
  var sized = "ResizeObserver" in window ? new ResizeObserver(function (list) { list.forEach(function (e) { shape(e.target); }); }) : null;
  function continuous(root) {
    Object.keys(RADII).forEach(function (cls) {
      (root || document).querySelectorAll("." + cls).forEach(function (el) {
        if (el.dataset.sq) return;
        el.dataset.sq = cls;
        shape(el);
        if (sized) sized.observe(el);
      });
    });
  }
  continuous();

  // MARK: City chips: fade the edge that has more beyond it.

  document.querySelectorAll(".chips").forEach(function (row) {
    function edges() {
      row.classList.toggle("more", row.scrollWidth - row.scrollLeft - row.clientWidth > 2);
      row.classList.toggle("less", row.scrollLeft > 2);
    }
    // The picked city in view (a city page's chip may sit off the right edge).
    var on = row.querySelector("[aria-current]");
    if (on && on.offsetLeft + on.offsetWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - 24;
    row.addEventListener("scroll", edges, { passive: true });
    window.addEventListener("resize", edges);
    edges();
  });

  // MARK: Modal

  var modal = document.getElementById("modal");
  if (!modal) return;
  var img = document.getElementById("m-img"), score = document.getElementById("m-score");
  var name = document.getElementById("m-name"), where = document.getElementById("m-where"), when = document.getElementById("m-when");
  var maps = document.getElementById("m-maps");
  var home = { url: location.href, title: document.title };
  var opened = false, lastTile = null;

  function show(tile, keyboard) {
    var d = tile.dataset;
    img.src = d.photo;
    img.alt = d.name + " at " + d.place;
    if (d.score) { score.textContent = d.score; score.style.background = d.tone; score.hidden = false; } else { score.hidden = true; }
    name.textContent = d.name;
    where.textContent = d.place + " · " + d.city;
    when.textContent = "Rated " + d.when;
    maps.href = d.maps;
    modal.hidden = false;
    document.documentElement.style.overflow = "hidden";
    // Opened from the keyboard: focus moves to the close button. With a tap or click it doesn't (no ring on it).
    if (keyboard) modal.querySelector(".x").focus({ preventScroll: true });
    lastTile = tile;
  }

  function hide() {
    modal.hidden = true;
    document.documentElement.style.overflow = "";
    img.removeAttribute("src");
    if (lastTile && document.activeElement && modal.contains(document.activeElement)) lastTile.focus({ preventScroll: true });
  }

  document.addEventListener("click", function (e) {
    var tile = e.target.closest && e.target.closest("a.tile");
    if (!tile || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    show(tile, e.detail === 0);
    history.pushState({ modal: true }, "", tile.href);
    document.title = tile.dataset.name + " at " + tile.dataset.place + " · Ate10";
    opened = true;
  });

  function close() {
    if (opened) { history.back(); } else { hide(); }
  }

  window.addEventListener("popstate", function (e) {
    if (e.state && e.state.modal) return;
    opened = false;
    document.title = home.title;
    hide();
  });

  modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
  modal.querySelector(".x").addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) close(); });
})();
