(function () {
  'use strict';
  // Category -> CSS variable holding its softened colour (light and dark values live in style.css)
  var CATS = {
    'Celebrating the Jazz Clubs': 'clubs',
    'Festival concert': 'concert',
    'Free': 'free',
    'Broadcasts': 'broad',
    'The Jazz Social': 'social',
    'Family': 'family',
    'Listening Room': 'listen'
  };
  function cvar(c) { return 'var(--c-' + (CATS[c] || 'listen') + ')'; }
  var DAYS = [];
  for (var d = 9; d <= 22; d++) DAYS.push('2026-11-' + (d < 10 ? '0' + d : d));
  var state = { q: '', day: null, cats: new Set(Object.keys(CATS)), venue: null };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var phone = window.matchMedia('(max-width: 760px)');
  var dark = window.matchMedia('(prefers-color-scheme: dark)');

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function dt(iso) { return new Date(iso + 'T12:00:00Z'); }
  function fmt(iso) { return dt(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function fmtLong(iso) { return dt(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); }
  function when(e) { return e.start === e.end ? fmt(e.start) : fmt(e.start) + ' – ' + fmt(e.end); }
  function mapsUrl(v) { return 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(v.venue + ', ' + v.address); }

  // Times: list of {date, start} or {date, doors}, 24h London time. Times before 06:00 are after midnight
  // following the listed date's evening, so they sort late and are labelled as such.
  function mins(t) { var v = t.start || t.doors; if (!v) return 9999; var h = +v.slice(0, 2), m = +v.slice(3, 5); return (h < 6 ? h + 24 : h) * 60 + m; }
  function tlabel(t) { var v = t.start || t.doors; return (t.doors && !t.start ? 'doors ' : '') + v + (mins(t) >= 1440 ? ' (after midnight)' : ''); }
  function timesOn(e, day) { return (e.times || []).filter(function (t) { return t.date === day; }).sort(function (a, b) { return mins(a) - mins(b); }); }
  function datesOf(e) { var s = []; (e.times || []).forEach(function (t) { if (s.indexOf(t.date) === -1) s.push(t.date); }); return s.sort(); }
  function playDates(e) {
    var ds = datesOf(e);
    if (ds.length) return ds;
    var out = [];
    DAYS.forEach(function (d) { if (e.start <= d && d <= e.end) out.push(d); });
    return out;
  }
  function timeText(e, day) { var ts = timesOn(e, day); return ts.length ? ts.map(tlabel).join(', ') : ''; }
  function sortKey(e, day) {
    var d = day || state.day || datesOf(e)[0] || e.start;
    var ts = timesOn(e, d);
    return [d, ts.length ? mins(ts[0]) : 9999];
  }
  function cmp(a, b, day) {
    var x = sortKey(a, day), y = sortKey(b, day);
    return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : (x[1] - y[1]) || a.title.localeCompare(b.title);
  }

  // ---- Map
  var map = L.map('map', { maxZoom: 19, scrollWheelZoom: true, zoomControl: true, attributionControl: true });
  // Basemap. CARTO Positron / Dark Matter need a free key since 25 Sep 2026 (carto.com/basemaps/apikey).
  // Paste a referer-restricted key here to use them; until then OpenStreetMap's tiles are used, toned grey in style.css.
  var CARTO_KEY = '';
  var OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  var tiles = [];
  function setTiles() {
    tiles.forEach(function (t) { map.removeLayer(t); }); tiles = [];
    var d = dark.matches;
    if (CARTO_KEY) {
      tiles.push(L.tileLayer('https://{s}.basemaps.cartocdn.com/' + (d ? 'dark_all' : 'light_all') + '/{z}/{x}/{y}{r}.png?key=' + encodeURIComponent(CARTO_KEY), { maxZoom: 20, subdomains: 'abcd', attribution: OSM + ' &copy; <a href="https://carto.com/attributions">CARTO</a>' }));
    } else {
      tiles.push(L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM }));
    }
    tiles.forEach(function (t) { t.addTo(map); });
  }
  setTiles();
  if (dark.addEventListener) dark.addEventListener('change', setTiles);

  var cluster = L.markerClusterGroup({
    maxClusterRadius: 44,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    animate: !reduceMotion.matches,
    iconCreateFunction: function (c) {
      var n = 0;
      c.getAllChildMarkers().forEach(function (m) { n += m.options.evCount || 0; });
      var s = n < 10 ? 34 : n < 50 ? 40 : 46;
      return L.divIcon({ className: '', html: '<div class="cl" style="width:' + s + 'px;height:' + s + 'px">' + n + '</div>', iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
    }
  });
  map.addLayer(cluster);

  // ---- Day segmented control
  var daysEl = document.getElementById('days');
  function segBtn(html, label, onClick) {
    var b = document.createElement('button');
    b.type = 'button'; b.innerHTML = html; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', onClick);
    daysEl.appendChild(b); return b;
  }
  var allDay = segBtn('All days', 'All days', function () { state.day = null; syncDays(); render(true); });
  var dayBtns = DAYS.map(function (d) {
    var dd = dt(d);
    var dw = dd.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
    return segBtn('<span class="dw">' + dw + '</span>' + dd.getUTCDate(), fmtLong(d), function () { state.day = d; syncDays(); render(true); });
  });
  function syncDays() {
    allDay.setAttribute('aria-pressed', state.day === null ? 'true' : 'false');
    dayBtns.forEach(function (b, i) {
      var on = DAYS[i] === state.day;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    });
  }
  syncDays();
  function edgeFade() {
    var max = daysEl.scrollWidth - daysEl.clientWidth;
    daysEl.classList.toggle('more-l', daysEl.scrollLeft > 4);
    daysEl.classList.toggle('more-r', daysEl.scrollLeft < max - 4);
  }
  daysEl.addEventListener('scroll', edgeFade, { passive: true });
  window.addEventListener('resize', edgeFade);
  edgeFade();

  // ---- Category pills
  var catsEl = document.getElementById('cats');
  Object.keys(CATS).forEach(function (c) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'pill'; b.setAttribute('aria-pressed', 'true');
    b.innerHTML = '<span class="dot" style="background:' + cvar(c) + '"></span>' + esc(c);
    b.addEventListener('click', function () {
      if (state.cats.has(c)) state.cats.delete(c); else state.cats.add(c);
      b.setAttribute('aria-pressed', state.cats.has(c) ? 'true' : 'false');
      render(true);
    });
    catsEl.appendChild(b);
  });

  document.getElementById('q').addEventListener('input', function (ev) { state.q = ev.target.value.trim().toLowerCase(); render(false); });

  // ---- Photos
  var EVENTS = [], markers = {}, PHOTOS = { events: {}, venues: {} };
  function eventPhoto(e) {
    var p = PHOTOS.events[e.title];
    return p ? { src: p.src, page: p.page, credit: p.credit, label: p.kind === 'tribute' ? 'In tribute to ' + p.name : p.name } : null;
  }
  function venuePhoto(name) {
    var v = PHOTOS.venues[name];
    return v ? { src: v.src, page: v.page, credit: v.credit, label: 'Venue: ' + (v.label || name) } : null;
  }
  function photoFor(e) { return eventPhoto(e) || venuePhoto(e.venue); }
  function initials(s) { return s.replace(/^The\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
  function thumbHtml(e) {
    var p = photoFor(e);
    if (!p) {
      var c = cvar(e.category);
      return '<div class="thumb ph" style="background:color-mix(in srgb,' + c + ' 18%,var(--surface));color:' + c + '" role="img" aria-label="' + esc(e.venue) + '">' + esc(initials(e.venue)) + '</div>';
    }
    return '<img class="thumb" src="' + esc(p.src) + '" alt="' + esc(p.label) + '" title="' + esc(p.label + ' · ' + p.credit) + '" loading="lazy" referrerpolicy="no-referrer">';
  }
  function creditHtml(p) {
    return '<span class="credit"><span class="lab">' + esc(p.label) + '</span> · <a href="' + esc(p.page) + '" target="_blank" rel="noopener">' + esc(p.credit) + '</a></span>';
  }

  function matches(e) {
    if (!state.cats.has(e.category)) return false;
    if (state.day) {
      if (e.times && e.times.length) { if (!e.times.some(function (t) { return t.date === state.day; })) return false; }
      else if (!(e.start <= state.day && state.day <= e.end)) return false;
    }
    if (state.q) {
      var hay = (e.title + ' ' + e.venue + ' ' + e.area).toLowerCase();
      if (hay.indexOf(state.q) === -1) return false;
    }
    return true;
  }

  // ---- Venue sheet / side panel
  var sheet = document.getElementById('sheet'), body = document.getElementById('sheet-body'), scrim = document.getElementById('scrim');
  var lastFocus = null, closeTimer = null;
  function eventWhenHtml(e) {
    var ds = state.day ? [state.day] : playDates(e);
    return ds.map(function (d) { var t = timeText(e, d); return esc(fmt(d)) + (t ? ' · ' + esc(t) : ''); }).join('<br>');
  }
  function sheetHtml(v, evs) {
    var vp = venuePhoto(v.venue);
    var head = (vp ? '<figure class="v-photo"><img src="' + esc(vp.src) + '" alt="' + esc(vp.label) + '" referrerpolicy="no-referrer">' + creditHtml(vp) + '</figure>' : '') +
      '<div class="v-head' + (vp ? '' : ' nophoto') + '"><h2 id="sheet-title">' + esc(v.venue) + '</h2><p>' + esc(v.address) + ' · <a href="' + mapsUrl(v) + '" target="_blank" rel="noopener">Map</a></p></div>';
    var items = evs.slice().sort(function (a, b) { return cmp(a, b); }).map(function (e) {
      var ep = eventPhoto(e);
      return '<li><div class="row">' + (ep ? '<img class="ev-ph" src="' + esc(ep.src) + '" alt="' + esc(ep.label) + '" loading="lazy" referrerpolicy="no-referrer">' : '') +
        '<div><div class="when">' + eventWhenHtml(e) + '</div><a class="title" href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.title) + '</a>' +
        '<div class="meta"><span class="dotc" style="color:' + cvar(e.category) + '">●</span> ' + esc(e.category) + (e.note ? ' · ' + esc(e.note) : '') + '</div>' +
        (ep ? creditHtml(ep) : '') + '</div></div></li>';
    }).join('');
    return head + '<ul class="v-events">' + items + '</ul>';
  }
  function openVenue(name, fromEl) {
    var evs = EVENTS.filter(function (e) { return e.venue === name && matches(e); });
    if (!evs.length) return;
    clearTimeout(closeTimer);
    state.venue = name;
    lastFocus = fromEl || document.activeElement;
    body.innerHTML = sheetHtml(evs[0], evs);
    body.scrollTop = 0;
    sheet.classList.remove('closing');
    sheet.hidden = false;
    sheet.setAttribute('aria-modal', phone.matches ? 'true' : 'false');
    if (phone.matches) { scrim.hidden = false; document.body.style.overflow = 'hidden'; }
    markSelected();
    setTimeout(function () { document.getElementById('sheet-close').focus({ preventScroll: true }); }, 30);
  }
  function closeSheet() {
    if (sheet.hidden) return;
    state.venue = null; markSelected();
    sheet.classList.add('closing'); scrim.hidden = true; document.body.style.overflow = '';
    closeTimer = setTimeout(function () { sheet.hidden = true; sheet.classList.remove('closing'); }, reduceMotion.matches ? 0 : 240);
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  document.getElementById('sheet-close').addEventListener('click', closeSheet);
  scrim.addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeSheet(); });
  // Swipe down to dismiss on phones
  (function () {
    var y0 = null, dy = 0;
    sheet.addEventListener('touchstart', function (ev) { if (!phone.matches || body.scrollTop > 0) { y0 = null; return; } y0 = ev.touches[0].clientY; dy = 0; }, { passive: true });
    sheet.addEventListener('touchmove', function (ev) { if (y0 === null) return; dy = Math.max(0, ev.touches[0].clientY - y0); sheet.style.transform = dy ? 'translateY(' + dy + 'px)' : ''; }, { passive: true });
    sheet.addEventListener('touchend', function () { if (y0 === null) return; sheet.style.transform = ''; if (dy > 90) closeSheet(); y0 = null; });
  })();
  function markSelected() {
    Object.keys(markers).forEach(function (n) {
      var el = markers[n].getElement && markers[n].getElement();
      var pin = el && el.querySelector('.pin');
      if (pin) pin.classList.toggle('sel', n === state.venue);
    });
  }

  // ---- Render
  function pinIcon(evs) {
    var counts = {}; evs.forEach(function (e) { counts[e.category] = (counts[e.category] || 0) + 1; });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    var key = CATS[top] || 'listen';
    return L.divIcon({ className: '', html: '<div class="pin" style="background:var(--p-' + key + ')">' + evs.length + '</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
  }
  var hdr = document.getElementById('bar');
  function setHdr() { document.documentElement.style.setProperty('--hdr', hdr.offsetHeight + 'px'); }
  window.addEventListener('resize', setHdr);

  function render(animate) {
    var shown = EVENTS.filter(matches);
    var byVenue = {};
    shown.forEach(function (e) { (byVenue[e.venue] = byVenue[e.venue] || []).push(e); });
    cluster.clearLayers(); markers = {};
    Object.keys(byVenue).forEach(function (name) {
      var evs = byVenue[name], v = evs[0];
      var m = L.marker([v.lat, v.lng], { icon: pinIcon(evs), title: v.venue + ', ' + evs.length + (evs.length === 1 ? ' event' : ' events'), keyboard: true, evCount: evs.length });
      m.on('click', function () { openVenue(name, m.getElement()); });
      m.on('keypress', function (ev) { if (ev.originalEvent && (ev.originalEvent.key === 'Enter' || ev.originalEvent.key === ' ')) openVenue(name, m.getElement()); });
      cluster.addLayer(m); markers[name] = m;
    });
    var nv = Object.keys(byVenue).length;
    document.getElementById('count').textContent = shown.length + (shown.length === 1 ? ' event' : ' events') + ' at ' + nv + (nv === 1 ? ' venue' : ' venues');
    if (state.venue) { if (byVenue[state.venue]) openVenue(state.venue, lastFocus); else closeSheet(); }
    markSelected();

    // Group by day: an event appears under each date it plays (or just the selected day)
    var groups = {};
    shown.forEach(function (e) {
      (state.day ? [state.day] : playDates(e)).forEach(function (d) { (groups[d] = groups[d] || []).push(e); });
    });
    var list = document.getElementById('list');
    var html = Object.keys(groups).sort().map(function (d) {
      var rows = groups[d].sort(function (a, b) { return cmp(a, b, d); }).map(function (e) {
        var t = timeText(e, d);
        return '<li class="card" data-venue="' + esc(e.venue) + '" tabindex="0" aria-label="' + esc((t ? t + ', ' : '') + e.title + ', ' + e.venue + '. Show on map') + '">' + thumbHtml(e) +
          '<div><div class="when">' + esc(t || fmt(d)) + '</div><div class="title">' + esc(e.title) + '</div><div class="meta">' + esc(e.venue) + ' · ' + esc(e.area) + '</div></div>' +
          '<a class="details" href="' + esc(e.url) + '" target="_blank" rel="noopener" aria-label="Details for ' + esc(e.title) + ' on the official site">Details</a></li>';
      }).join('');
      return '<section class="day" aria-label="' + esc(fmtLong(d)) + '"><h2>' + esc(fmtLong(d)) + '</h2><ul>' + rows + '</ul></section>';
    }).join('');
    list.innerHTML = html || '<p class="empty">No events match these filters.</p>';
    if (animate && !reduceMotion.matches) { list.classList.remove('fade'); void list.offsetWidth; list.classList.add('fade'); }
  }

  function focusVenue(name, el) {
    var m = markers[name];
    if (!m) return;
    var mapEl = document.getElementById('map');
    var top = mapEl.getBoundingClientRect().top + window.scrollY - (hdr.offsetHeight + 12);
    window.scrollTo({ top: top, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    cluster.zoomToShowLayer(m, function () {
      map.setView(m.getLatLng(), Math.max(map.getZoom(), 16), { animate: !reduceMotion.matches });
      openVenue(name, el);
    });
  }
  var listEl = document.getElementById('list');
  listEl.addEventListener('click', function (ev) {
    if (ev.target.closest('a')) return;
    var li = ev.target.closest('.card'); if (li) focusVenue(li.getAttribute('data-venue'), li);
  });
  listEl.addEventListener('keydown', function (ev) {
    if (ev.target.classList && ev.target.classList.contains('card') && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); focusVenue(ev.target.getAttribute('data-venue'), ev.target); }
  });

  Promise.all(['events-1.json', 'events-2.json', 'photos.json'].map(function (f) { return fetch(f).then(function (r) { return r.json(); }); })).then(function (parts) {
    var data = parts[0].concat(parts[1]);
    PHOTOS = parts[2];
    EVENTS = data;
    setHdr();
    map.fitBounds(L.latLngBounds(data.map(function (e) { return [e.lat, e.lng]; })), { padding: [24, 24] });
    render(false);
    window.__ready = true;
  });
})();
