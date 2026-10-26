(function () {
  'use strict';
  var COLORS = {
    'Celebrating the Jazz Clubs': '#1f6feb',
    'Festival concert': '#8250df',
    'Free': '#1a7f37',
    'Broadcasts': '#bf3989',
    'The Jazz Social': '#d4a017',
    'Family': '#e8590c',
    'Listening Room': '#57606a'
  };
  var DAYS = [];
  for (var d = 9; d <= 22; d++) DAYS.push('2026-11-' + (d < 10 ? '0' + d : d));
  var state = { q: '', day: null, cats: new Set(Object.keys(COLORS)) };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function fmt(iso) { var d = new Date(iso + 'T12:00:00Z'); return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function when(e) { return e.start === e.end ? fmt(e.start) : fmt(e.start) + ' – ' + fmt(e.end); }
  // Times: list of {date, start} or {date, doors}, 24h London time. Times before 06:00 are after midnight
  // following the listed date's evening, so they sort late and are labelled as such.
  function mins(t) { var v = t.start || t.doors; if (!v) return 9999; var h = +v.slice(0, 2), m = +v.slice(3, 5); return (h < 6 ? h + 24 : h) * 60 + m; }
  function tlabel(t) { var v = t.start || t.doors; return (t.doors && !t.start ? 'doors ' : '') + v + (mins(t) >= 1440 ? ' (after midnight)' : ''); }
  function timesOn(e, day) { return (e.times || []).filter(function (t) { return t.date === day; }).sort(function (a, b) { return mins(a) - mins(b); }); }
  function datesOf(e) { var s = []; (e.times || []).forEach(function (t) { if (s.indexOf(t.date) === -1) s.push(t.date); }); return s.sort(); }
  function dayLine(e, day) { var ts = timesOn(e, day); return fmt(day) + (ts.length ? ' · ' + ts.map(tlabel).join(', ') : ''); }
  function whenShort(e) {
    if (state.day) return dayLine(e, state.day);
    if (e.start === e.end) return dayLine(e, e.start);
    var ds = datesOf(e);
    if (!ds.length) return when(e);
    var sig = ds.map(function (d) { return timesOn(e, d).map(tlabel).join(', '); });
    var same = sig.every(function (s) { return s === sig[0]; });
    return when(e) + ' (' + ds.length + ' dates) · ' + (same && sig[0] ? sig[0] : 'times vary by date');
  }
  function whenFull(e) {
    if (state.day) return esc(dayLine(e, state.day));
    if (e.start === e.end || !datesOf(e).length) return esc(whenShort(e));
    return datesOf(e).map(function (d) { return esc(dayLine(e, d)); }).join('<br>');
  }
  function sortKey(e) {
    var d = state.day || datesOf(e)[0] || e.start;
    var ts = timesOn(e, d);
    return [d, ts.length ? mins(ts[0]) : 9999];
  }
  function mapsUrl(v) { return 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(v.venue + ', ' + v.address); }

  var map = L.map('map', { scrollWheelZoom: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  var cluster = L.markerClusterGroup({ maxClusterRadius: 40 });
  map.addLayer(cluster);

  // Day chips
  var daysEl = document.getElementById('days');
  function chip(label, pressed, onClick, color) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.innerHTML = (color ? '<span class="dot" style="background:' + color + '"></span>' : '') + esc(label);
    b.addEventListener('click', onClick);
    return b;
  }
  var allDay = chip('All days', true, function () { state.day = null; syncDays(); render(); });
  daysEl.appendChild(allDay);
  var dayBtns = DAYS.map(function (d) {
    var b = chip(fmt(d), false, function () { state.day = d; syncDays(); render(); });
    daysEl.appendChild(b); return b;
  });
  function syncDays() {
    allDay.setAttribute('aria-pressed', state.day === null ? 'true' : 'false');
    dayBtns.forEach(function (b, i) { b.setAttribute('aria-pressed', DAYS[i] === state.day ? 'true' : 'false'); });
  }

  // Category chips
  var catsEl = document.getElementById('cats');
  Object.keys(COLORS).forEach(function (c) {
    var b = chip(c, true, function () {
      if (state.cats.has(c)) state.cats.delete(c); else state.cats.add(c);
      b.setAttribute('aria-pressed', state.cats.has(c) ? 'true' : 'false');
      render();
    }, COLORS[c]);
    catsEl.appendChild(b);
  });

  document.getElementById('q').addEventListener('input', function (ev) { state.q = ev.target.value.trim().toLowerCase(); render(); });

  var EVENTS = [], markers = {}, PHOTOS = { events: {}, venues: {} };

  function photoFor(e) {
    var p = PHOTOS.events[e.title];
    if (p) return { src: p.src, page: p.page, credit: p.credit, label: p.kind === 'tribute' ? 'In tribute to ' + p.name : p.name };
    var v = PHOTOS.venues[e.venue];
    if (v) return { src: v.src, page: v.page, credit: v.credit, label: 'Venue: ' + (v.label || e.venue) };
    return null;
  }
  function figHtml(p, cls) {
    return '<figure class="' + cls + '"><img src="' + esc(p.src) + '" alt="' + esc(p.label) + '" title="' + esc(p.label + ' · ' + p.credit) + '" loading="lazy" referrerpolicy="no-referrer"><figcaption><span class="lab">' + esc(p.label) + '</span> <a href="' + esc(p.page) + '" target="_blank" rel="noopener">' + esc(p.credit) + '</a></figcaption></figure>';
  }
  function thumbHtml(e, cls) {
    var p = photoFor(e);
    if (!p) return '<div class="' + cls + ' ph" style="background:' + (COLORS[e.category] || '#57606a') + '"><span>' + esc(e.venue) + '</span></div>';
    return figHtml(p, cls);
  }
  function eventPhotoHtml(e) {
    var p = PHOTOS.events[e.title];
    if (!p) return '';
    return figHtml({ src: p.src, page: p.page, credit: p.credit, label: p.kind === 'tribute' ? 'In tribute to ' + p.name : p.name }, 'pthumb');
  }
  function venuePhotoHtml(v) {
    var p = PHOTOS.venues[v.venue];
    if (!p) return '';
    return figHtml({ src: p.src, page: p.page, credit: p.credit, label: 'Venue: ' + (p.label || v.venue) }, 'vphoto');
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

  function popupHtml(v, evs) {
    var items = evs.slice().sort(function (a, b) { var x = sortKey(a), y = sortKey(b); return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1]; }).map(function (e) {
      return '<li>' + eventPhotoHtml(e) + '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.title) + '</a><br><span class="meta">' + whenFull(e) + '<br>' + esc(e.category) + (e.note ? ' · ' + esc(e.note) : '') + '</span></li>';
    }).join('');
    return '<div class="pop"><h3>' + esc(v.venue) + '</h3><p class="addr">' + esc(v.address) + ' · <a href="' + mapsUrl(v) + '" target="_blank" rel="noopener">Map</a></p>' + venuePhotoHtml(v) + '<ul>' + items + '</ul></div>';
  }

  function render() {
    var shown = EVENTS.filter(matches);
    var byVenue = {};
    shown.forEach(function (e) { (byVenue[e.venue] = byVenue[e.venue] || []).push(e); });
    cluster.clearLayers(); markers = {};
    Object.keys(byVenue).forEach(function (name) {
      var evs = byVenue[name], v = evs[0];
      var counts = {}; evs.forEach(function (e) { counts[e.category] = (counts[e.category] || 0) + 1; });
      var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
      var icon = L.divIcon({ className: '', html: '<div class="pin" style="background:' + COLORS[top] + '">' + evs.length + '</div>', iconSize: [30, 30], iconAnchor: [15, 15] });
      var m = L.marker([v.lat, v.lng], { icon: icon, title: v.venue }).bindPopup(popupHtml(v, evs), { maxWidth: 320 });
      cluster.addLayer(m); markers[name] = m;
    });
    document.getElementById('count').textContent = 'Showing ' + shown.length + ' events at ' + Object.keys(byVenue).length + ' venues';
    var list = document.getElementById('list');
    list.innerHTML = '';
    shown.map(function (e) { return { e: e, k: sortKey(e) }; }).sort(function (a, b) { return a.k[0] < b.k[0] ? -1 : a.k[0] > b.k[0] ? 1 : a.k[1] - b.k[1] || a.e.title.localeCompare(b.e.title); }).map(function (x) { return x.e; })
      .forEach(function (e) {
        var li = document.createElement('li');
        li.innerHTML = thumbHtml(e, 'lthumb') + '<div><div class="t">' + esc(e.title) + '</div><div class="m">' + esc(whenShort(e)) + ' · ' + esc(e.venue) + ' · ' + esc(e.area) + ' · ' + esc(e.category) + '</div></div><a href="' + esc(e.url) + '" target="_blank" rel="noopener">Details</a>';
        li.addEventListener('click', function (ev) {
          if (ev.target.tagName === 'A' || ev.target.closest('a')) return;
          var m = markers[e.venue];
          if (m) { cluster.zoomToShowLayer(m, function () { m.openPopup(); }); document.getElementById('map').scrollIntoView({ behavior: 'smooth' }); }
        });
        list.appendChild(li);
      });
  }

  Promise.all(['events-1.json', 'events-2.json', 'photos.json'].map(function (f) { return fetch(f).then(function (r) { return r.json(); }); })).then(function (parts) {
    var data = parts[0].concat(parts[1]);
    PHOTOS = parts[2];
    EVENTS = data;
    map.fitBounds(L.latLngBounds(data.map(function (e) { return [e.lat, e.lng]; })), { padding: [20, 20] });
    render();
  });
})();
