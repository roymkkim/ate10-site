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

  // MARK: Modal

  var modal = document.getElementById("modal");
  if (!modal) return;
  var img = document.getElementById("m-img"), score = document.getElementById("m-score");
  var name = document.getElementById("m-name"), where = document.getElementById("m-where"), when = document.getElementById("m-when");
  var maps = document.getElementById("m-maps");
  var home = { url: location.href, title: document.title };
  var opened = false, lastTile = null;

  function show(tile) {
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
    modal.querySelector(".x").focus();
    lastTile = tile;
  }

  function hide() {
    modal.hidden = true;
    document.documentElement.style.overflow = "";
    img.removeAttribute("src");
    if (lastTile) lastTile.focus();
  }

  document.addEventListener("click", function (e) {
    var tile = e.target.closest && e.target.closest("a.tile");
    if (!tile || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    show(tile);
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
