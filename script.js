// Weather data comes from Open-Meteo (free, no API key): https://open-meteo.com
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const KEY = 'nimbus-v1';
const DEFAULT_PLACE = {name:'London', admin1:'England', country:'United Kingdom', latitude:51.5085, longitude:-0.1257};

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let unit = 'c', place = DEFAULT_PLACE, data = null, others = [], requestId = 0;
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved) {
    if (saved.unit === 'f') unit = 'f';
    if (saved.place && saved.place.latitude != null) place = saved.place;
  }
} catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({unit, place})); } catch (e) {} };

/* ---------- Weather codes (WMO) -> text, icon kind ---------- */
function describe(code) {
  if (code === 0) return ['Clear sky', 'clear'];
  if (code === 1) return ['Mostly clear', 'clear'];
  if (code === 2) return ['Partly cloudy', 'partly'];
  if (code === 3) return ['Overcast', 'cloud'];
  if (code <= 48) return ['Fog', 'fog'];
  if (code <= 57) return ['Drizzle', 'rain'];
  if (code <= 67) return ['Rain', 'rain'];
  if (code <= 77) return ['Snow', 'snow'];
  if (code <= 82) return ['Rain showers', 'rain'];
  if (code <= 86) return ['Snow showers', 'snow'];
  return ['Thunderstorm', 'storm'];
}
// Page background: sunny/clear changes with day and night, the rest match the sky
const moodOf = (kind, day) => kind === 'clear' || kind === 'partly' ? (day ? 'day' : 'night') : kind === 'fog' ? 'cloud' : kind;

/* ---------- Icons (inline SVG, drawn on a 64x64 grid) ---------- */
const CLOUD = '<path d="M19 46h27a10 10 0 0 0 1-19.9A14 14 0 0 0 20.5 28 9 9 0 0 0 19 46z"/>';
const SUN = '<g stroke="#FFD166"><circle cx="32" cy="32" r="9"/><path d="M32 9v6M32 49v6M9 32h6M49 32h6M16 16l4 4M44 44l4 4M48 16l-4 4M20 44l-4 4"/></g>';
const MOON = '<path stroke="#DDE6FF" d="M51.6 33.8A19.5 19.5 0 1 1 30.3 12.5 15.2 15.2 0 0 0 51.6 33.8z"/>';
const g = (transform, inner, width) => `<g transform="${transform}"${width ? ` stroke-width="${width}"` : ''}>${inner}</g>`;

function icon(kind, day) {
  const body = {
    clear: day ? SUN : MOON,
    partly: g('translate(-4 -4) scale(.6)', day ? SUN : MOON, 4.5) + g('translate(14 15) scale(.75)', CLOUD, 4),
    cloud: CLOUD,
    fog: '<path d="M14 22h36M10 32h36M18 42h32M12 52h30"/>',
    rain: g('translate(0 -6)', CLOUD) + '<path stroke="#7DD3FC" d="M24 46l-3 8M34 46l-3 8M44 46l-3 8"/>',
    snow: g('translate(0 -6)', CLOUD) + '<path stroke-width="5" d="M23 48v.1M33 54v.1M43 48v.1"/>',
    storm: g('translate(0 -6)', CLOUD) + '<path stroke="#FFD166" d="M34 42l-7 9h9l-5 10"/>'
  }[kind];
  return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/* ---------- Formatting ---------- */
const temp = c => Math.round(unit === 'c' ? c : c * 9 / 5 + 32) + '°';
const speed = kmh => unit === 'c' ? `${Math.round(kmh)} km/h` : `${Math.round(kmh * 0.621371)} mph`;
const compass = deg => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
// Times from the API are the place's own local clock time, so show them as they are
const clock = iso => new Date(iso).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
const setStatus = msg => { $('#status').textContent = msg; };

/* ---------- Render ---------- */
function render() {
  if (!data) return;
  const c = data.current, d = data.daily;
  const [text, kind] = describe(c.weather_code);
  const day = !!c.is_day;
  document.body.dataset.mood = moodOf(kind, day);

  $('#place').textContent = place.name;
  $('#sub').textContent = [place.admin1 && place.admin1 !== place.name ? place.admin1 : '', place.country].filter(Boolean).join(', ');
  $('#when').textContent = new Date(c.time).toLocaleString([], {weekday:'long', hour:'numeric', minute:'2-digit'}) + ' local time';
  $('#icon').innerHTML = icon(kind, day);
  $('#temp').textContent = temp(c.temperature_2m);
  $('#desc').textContent = text;
  $('#hilo').textContent = `High ${temp(d.temperature_2m_max[0])}, low ${temp(d.temperature_2m_min[0])}`;
  $('#feels').textContent = temp(c.apparent_temperature);
  $('#hum').textContent = Math.round(c.relative_humidity_2m) + '%';
  $('#wind').textContent = `${speed(c.wind_speed_10m)} ${compass(c.wind_direction_10m)}`;
  const chance = d.precipitation_probability_max && d.precipitation_probability_max[0];
  $('#rain').textContent = chance == null ? '–' : chance + '%';
  $('#rise').textContent = clock(d.sunrise[0]);
  $('#set').textContent = clock(d.sunset[0]);

  // Each bar shows that day's low-to-high range, scaled to the coldest and warmest day of the week
  const min = Math.min(...d.temperature_2m_min), max = Math.max(...d.temperature_2m_max), span = (max - min) || 1;
  $('#days').innerHTML = d.time.map((t, i) => {
    const [label, k] = describe(d.weather_code[i]);
    const lo = d.temperature_2m_min[i], hi = d.temperature_2m_max[i];
    const left = (lo - min) / span * 100, width = Math.min(Math.max((hi - lo) / span * 100, 6), 100 - left);
    const name = i === 0 ? 'Today' : new Date(t + 'T00:00').toLocaleDateString([], {weekday:'short'});
    return `<li><span class="dn">${name}</span><span class="di" role="img" aria-label="${label}">${icon(k, true)}</span>
      <span class="lo">${temp(lo)}</span><span class="track"><span class="fill" style="left:${left}%;width:${width}%"></span></span><span class="hi">${temp(hi)}</span></li>`;
  }).join('');
}

/* ---------- Loading data ---------- */
async function load(p) {
  place = p; save();
  const id = ++requestId;
  setStatus('Loading weather…');
  try {
    const params = new URLSearchParams({
      latitude: p.latitude, longitude: p.longitude, timezone: 'auto', forecast_days: 7,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
    });
    const res = await fetch(`${FORECAST}?${params}`);
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.reason || res.status);
    if (id !== requestId) return;          // a newer search already replaced this one
    data = json;
    setStatus('');
    $('#now').hidden = false; $('#week').hidden = false;
    render();
  } catch (e) {
    if (id === requestId) setStatus('Couldn’t load the weather. Check your connection and try again.');
  }
}

const toPlace = r => ({name:r.name, admin1:r.admin1 || '', country:r.country || '', latitude:r.latitude, longitude:r.longitude});

function showOthers(list) {
  others = list;
  $('#extra').hidden = !list.length;
  $('#choices').innerHTML = list.map((p, i) =>
    `<li><button type="button" data-i="${i}">${esc(p.name)}${p.admin1 || p.country ? ', ' + esc(p.admin1 || p.country) : ''}</button></li>`).join('');
}

/* ---------- Events ---------- */
$('#form').onsubmit = async e => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (!q) return;
  setStatus('Searching…');
  showOthers([]);
  try {
    const res = await fetch(`${GEO}?${new URLSearchParams({name:q, count:5, language:'en', format:'json'})}`);
    const json = await res.json();
    if (!res.ok) throw new Error();
    const found = (json.results || []).map(toPlace);
    if (!found.length) return setStatus(`No place found for “${q}”.`);
    showOthers(found.slice(1));            // the best match loads now, the rest become quick links
    load(found[0]);
  } catch (err) {
    setStatus('Couldn’t search right now. Check your connection and try again.');
  }
};

$('#choices').onclick = e => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  const p = others[+b.dataset.i];
  showOthers([]);
  load(p);
};

$('#loc').onclick = () => {
  if (!navigator.geolocation) return setStatus('Your browser can’t share its location.');
  setStatus('Finding your location…');
  navigator.geolocation.getCurrentPosition(
    pos => { showOthers([]); load({name:'Your location', admin1:'', country:'', latitude:+pos.coords.latitude.toFixed(3), longitude:+pos.coords.longitude.toFixed(3)}); },
    () => setStatus('Location access was blocked. Search for a city instead.'),
    {timeout:10000}
  );
};

function markUnits() {
  document.querySelectorAll('[data-u]').forEach(b => b.setAttribute('aria-pressed', b.dataset.u === unit));
}
document.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { unit = b.dataset.u; save(); markUnits(); render(); });

markUnits();
load(place);
