(function () {
  const route = window.ROUTE;
  const stopsEl = document.getElementById("stops");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---- Карточки остановок
  route.forEach((s, i) => {
    const wikiUrl = "https://ru.wikipedia.org/wiki/" + encodeURIComponent(s.wiki);
    const yandex = `https://yandex.ru/maps/?pt=${s.coords[1]},${s.coords[0]}&z=16&l=map`;
    const el = document.createElement("article");
    el.className = "stop";
    el.id = "stop-" + s.id;
    el.dataset.index = i;
    el.innerHTML = `
      <div class="photo">
        <img class="now" alt="${esc(s.title)}" loading="lazy">
        <div class="num">${i + 1}</div>
      </div>
      <div class="body">
        <div class="meta"><span class="chip">${esc(s.era)}</span><span class="chip metro">${esc(s.metro)}</span></div>
        <h3>${esc(s.title)}</h3>
        <p class="lead">${esc(s.lead)}</p>
        ${s.text.map((t) => `<p>${esc(t)}</p>`).join("")}
        <div class="why"><b>Значение</b>${esc(s.why)}</div>
        <div class="next">${esc(s.next)}</div>
        <div class="links">
          <a href="${yandex}" target="_blank" rel="noopener">Открыть в Яндекс Картах</a>
          <a href="${wikiUrl}" target="_blank" rel="noopener">Подробнее в Википедии</a>
        </div>
      </div>`;
    stopsEl.appendChild(el);
  });

  // ---- Фото: сначала своё (photos/<id>.jpg), иначе из Википедии
  const titles = route.map((s) => s.wiki);
  const wikiThumbs = fetch(
    "https://ru.wikipedia.org/w/api.php?action=query&prop=pageimages&pithumbsize=1000&redirects=1&format=json&origin=*&titles=" +
      encodeURIComponent(titles.join("|"))
  )
    .then((r) => r.json())
    .then((data) => {
      const map = {};
      const alias = {};
      (data.query.normalized || []).forEach((n) => (alias[n.from] = n.to));
      (data.query.redirects || []).forEach((n) => (alias[n.from] = n.to));
      Object.values(data.query.pages || {}).forEach((p) => {
        if (p.thumbnail) map[p.title] = p.thumbnail.source;
      });
      return (title) => {
        let t = title;
        for (let k = 0; k < 3 && alias[t]; k++) t = alias[t];
        return map[t] || map[t.replace(/_/g, " ")] || null;
      };
    })
    .catch(() => () => null);

  const credit = (photo, ver, href, text) => {
    const a = document.createElement("a");
    a.className = "credit credit-" + ver;
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = text;
    photo.appendChild(a);
  };
  const commonsThumb = (file) =>
    "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(file) + "?width=1000";
  const commonsPage = (file) => "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(file.replace(/ /g, "_"));

  route.forEach((s) => {
    const card = document.getElementById("stop-" + s.id);
    const photo = card.querySelector(".photo");

    // Современное фото: photos/<id>.jpg, иначе — из Википедии
    const img = photo.querySelector("img.now");
    img.onload = () => img.classList.add("loaded");
    img.onerror = () => {
      img.onerror = null;
      wikiThumbs.then((get) => {
        const src = get(s.wiki);
        if (!src) return;
        img.src = src;
        credit(photo, "now", "https://ru.wikipedia.org/wiki/" + encodeURIComponent(s.wiki), "Фото: Википедия");
      });
    };
    img.src = "photos/" + s.id + ".jpg";

    // Историческое фото: photos/<id>-old.jpg, иначе — файл из Wikimedia Commons (поле old в data.js)
    const old = document.createElement("img");
    old.className = "old";
    old.alt = s.title + " — историческое фото";
    old.loading = "lazy";
    let fromCommons = false;
    old.onerror = () => {
      if (fromCommons || !(s.old && s.old.file)) return; // старого фото нет — переключатель не показываем
      fromCommons = true;
      old.src = commonsThumb(s.old.file);
    };
    old.onload = () => {
      old.classList.add("loaded");
      photo.classList.add("has-old");
      if (fromCommons) credit(photo, "old", commonsPage(s.old.file), "Фото: Wikimedia Commons");
      const cap = document.createElement("div");
      cap.className = "old-caption";
      cap.textContent = (s.old && s.old.caption) || "Архивное фото";
      photo.appendChild(cap);

      const sw = document.createElement("div");
      sw.className = "era-switch";
      sw.setAttribute("role", "group");
      sw.setAttribute("aria-label", "Сравнить: сейчас или раньше");
      sw.innerHTML = '<button type="button" data-v="now" aria-pressed="true">Сейчас</button><button type="button" data-v="old" aria-pressed="false">Раньше</button>';
      sw.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        const showOld = b.dataset.v === "old";
        photo.classList.toggle("show-old", showOld);
        sw.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      });
      photo.appendChild(sw);
    };
    photo.insertBefore(old, img.nextSibling);
    old.src = "photos/" + s.id + "-old.jpg";
  });

  // ---- Карта
  if (!window.L) return;
  // На телефоне одним пальцем листается страница, а не карта (масштаб — кнопками +/−)
  const map = L.map("map", { scrollWheelZoom: false, zoomControl: true, dragging: !L.Browser.mobile, tap: false });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  // Бесплатные карты без API-ключа.
  // На сайте (http/https) — OpenStreetMap; при открытии файла с диска OSM блокирует
  // запросы без Referer, поэтому там используем Esri.
  if (location.protocol.startsWith("http")) {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
  } else {
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 19,
    }).addTo(map);
  }

  const mapNow = document.getElementById("mapNow");
  const latlngs = route.map((s) => s.coords);
  L.polyline(latlngs, { color: "#2f6fa8", weight: 3, dashArray: "6 8", opacity: 0.8 }).addTo(map);

  const markers = route.map((s, i) => {
    const icon = L.divIcon({ className: "", html: `<div class="mk">${i + 1}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    const m = L.marker(s.coords, { icon, title: s.title }).addTo(map);
    m.bindPopup(`<b>${i + 1}. ${esc(s.title)}</b><br>${esc(s.era)}`);
    m.on("click", () => document.getElementById("stop-" + s.id).scrollIntoView({ behavior: "smooth", block: "start" }));
    return m;
  });
  const bounds = L.latLngBounds(latlngs).pad(0.08);
  map.fitBounds(bounds);

  // ---- Синхронизация прокрутки и карты
  let active = -1;
  function activate(i) {
    if (i === active) return;
    if (active >= 0) {
      markers[active].getElement()?.firstElementChild?.classList.remove("on");
      document.querySelector(`.stop[data-index="${active}"]`)?.classList.remove("active");
    }
    active = i;
    markers[i].getElement()?.firstElementChild?.classList.add("on");
    document.querySelector(`.stop[data-index="${i}"]`)?.classList.add("active");
    mapNow.textContent = `${i + 1} / ${route.length} · ${route[i].title}`;
    map.flyTo(route[i].coords, 14, { duration: 0.8 });
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) activate(Number(e.target.dataset.index));
      });
    },
    { rootMargin: "-45% 0px -45% 0px" }
  );
  document.querySelectorAll(".stop").forEach((el) => io.observe(el));

  // Пока маршрут не начат — показываем его целиком
  const routeEl = document.getElementById("route");
  new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting && e.boundingClientRect.top > 0) {
        if (active >= 0) {
          markers[active].getElement()?.firstElementChild?.classList.remove("on");
          document.querySelector(`.stop[data-index="${active}"]`)?.classList.remove("active");
        }
        active = -1;
        mapNow.textContent = `Весь маршрут · ${route.length} остановок`;
        map.fitBounds(bounds);
      }
    });
  }).observe(routeEl);

  // ---- Кнопка «Свернуть / развернуть карту» (видна на телефоне)
  const mapCol = document.getElementById("mapCol");
  const toggle = document.getElementById("mapToggle");
  toggle.addEventListener("click", () => {
    const collapsed = mapCol.classList.toggle("collapsed");
    toggle.textContent = collapsed ? "Показать карту ▼" : "Свернуть карту ▲";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    if (!collapsed) {
      setTimeout(() => {
        map.invalidateSize();
        if (active >= 0) map.setView(route[active].coords, 14);
        else map.fitBounds(bounds);
      }, 320);
    }
  });

  // Высота закреплённой карты — чтобы карточки не прятались под ней при переходе
  const syncHeight = () => {
    document.documentElement.style.setProperty("--sticky-h", mapCol.offsetHeight + "px");
    map.invalidateSize();
  };
  if (window.ResizeObserver) new ResizeObserver(syncHeight).observe(mapCol);
  syncHeight();
})();
