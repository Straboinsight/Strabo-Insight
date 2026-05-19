/**
 * US → major supply-chain destinations (thinned from OpenFlights routes).
 * @see https://vasturiano.github.io/react-globe.gl/example/airline-routes/us-international-outbound.html
 */
(function () {
  const COUNTRY = "United States";
  const GOLD = "#C49A4A";
  const NAVY_FALLBACK = "#091E38";

  /** Read --navy from the page so the canvas matches the site exactly */
  function getSiteNavy() {
    const hex =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--navy")
        .trim() || NAVY_FALLBACK;
    const normalized = hex.startsWith("#") ? hex : `#${hex}`;
    return {
      css: normalized,
      three: parseInt(normalized.slice(1), 16),
    };
  }

  function applyGlobeBackground(globe) {
    if (!globe) return;
    const navy = getSiteNavy();
    const renderer = globe.renderer();
    if (renderer) {
      renderer.setClearColor(navy.three, 1);
    }
    const scene = globe.scene();
    if (scene) {
      scene.background = null;
    }
  }

  /** Major manufacturing / sourcing regions for US supply chains */
  const SUPPLY_CHAIN_COUNTRIES = new Set([
    "China",
    "Mexico",
    "Vietnam",
    "India",
    "Taiwan",
    "Japan",
    "South Korea",
    "Korea, Republic of",
    "Germany",
    "United Kingdom",
    "Canada",
    "Brazil",
    "Thailand",
    "Indonesia",
    "Malaysia",
    "Philippines",
    "Singapore",
    "Hong Kong",
    "France",
    "Italy",
    "Netherlands",
    "Australia",
    "Poland",
    "Czech Republic",
    "Turkey",
    "Bangladesh",
    "Costa Rica",
    "Guatemala",
    "Honduras",
    "Colombia",
    "Chile",
  ]);

  /** Prefer arcs from major US logistics hubs when picking one path per country */
  const US_HUB_IATAS = new Set([
    "ATL", "ORD", "LAX", "DFW", "JFK", "MIA", "SFO", "SEA", "EWR", "IAH", "CVG", "MEM",
  ]);

  /** Parse one CSV line (handles quoted fields with commas). */
  function parseCsvLine(line) {
    const fields = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        fields.push(field);
        field = "";
      } else {
        field += char;
      }
    }
    fields.push(field);
    return fields;
  }

  function parseRows(text, rowParser) {
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => rowParser(parseCsvLine(line)));
  }

  const airportParse = (cols) => ({
    airportId: cols[0],
    name: cols[1],
    city: cols[2],
    country: cols[3],
    iata: cols[4],
    icao: cols[5],
    lat: cols[6],
    lng: cols[7],
  });

  const routeParse = (cols) => ({
    airline: cols[0],
    airlineId: cols[1],
    srcIata: cols[2],
    srcAirportId: cols[3],
    dstIata: cols[4],
    dstAirportId: cols[5],
    codeshare: cols[6],
    stops: cols[7],
    equipment: cols[8],
  });

  function indexByIata(airports) {
    const map = Object.create(null);
    for (const airport of airports) {
      if (airport.iata && airport.iata !== "\\N") {
        map[airport.iata] = airport;
      }
    }
    return map;
  }

  function isSupplyChainDestination(country) {
    return SUPPLY_CHAIN_COUNTRIES.has(country);
  }

  /** One arc per destination country, preferring major US hub origins */
  function thinSupplyChainRoutes(routes) {
    const bestByCountry = new Map();

    for (const route of routes) {
      const country = route.dstAirport.country;
      if (!isSupplyChainDestination(country)) continue;

      const hubScore = US_HUB_IATAS.has(route.srcIata) ? 1 : 0;
      const current = bestByCountry.get(country);

      if (!current || hubScore > current.hubScore) {
        bestByCountry.set(country, { route, hubScore });
      }
    }

    return Array.from(bestByCountry.values(), (entry) => entry.route);
  }

  function configureGlobe(globe) {
    if (!globe) return;

    // Lower altitude = closer camera = larger globe on screen
    globe.pointOfView({ lat: 38, lng: -96, altitude: 2.32 });

    applyGlobeBackground(globe);

    const controls = globe.controls();
    if (!controls) return;

    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = Math.PI / 3.5;
    controls.maxPolarAngle = Math.PI - Math.PI / 3;
  }

  function GlobeWorld() {
    const { useState, useEffect, useRef, createElement: h } = React;
    const globeEl = useRef(null);
    const containerRef = useRef(null);
    const [size, setSize] = useState({ width: 600, height: 600 });
    const [routes, setRoutes] = useState([]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const update = () => {
        const { width, height } = el.getBoundingClientRect();
        setSize({
          width: Math.max(Math.round(width), 280),
          height: Math.max(Math.round(height), 280),
        });
      };

      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    useEffect(() => {
      let cancelled = false;

      Promise.all([
        fetch(
          "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat",
        ).then((r) => r.text()),
        fetch(
          "https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat",
        ).then((r) => r.text()),
      ])
        .then(([airportsText, routesText]) => {
          if (cancelled) return;

          const airportData = parseRows(airportsText, airportParse);
          const routeData = parseRows(routesText, routeParse);
          const byIata = indexByIata(airportData);

          const filteredRoutes = routeData
            .filter(
              (d) =>
                d.srcIata &&
                d.dstIata &&
                d.srcIata !== "\\N" &&
                d.dstIata !== "\\N" &&
                byIata[d.srcIata] &&
                byIata[d.dstIata],
            )
            .filter((d) => d.stops === "0")
            .map((d) => ({
              ...d,
              srcAirport: byIata[d.srcIata],
              dstAirport: byIata[d.dstIata],
            }))
            .filter(
              (d) =>
                d.srcAirport.country === COUNTRY &&
                isSupplyChainDestination(d.dstAirport.country),
            );

          setRoutes(thinSupplyChainRoutes(filteredRoutes));
        })
        .catch((err) => console.error("Globe route data failed:", err));

      return () => {
        cancelled = true;
      };
    }, []);

    useEffect(() => {
      if (globeEl.current) {
        configureGlobe(globeEl.current);
      }
    }, [routes]);

    const navy = getSiteNavy();

    return h(
      "div",
      { ref: containerRef, style: { width: "100%", height: "100%" } },
      h(Globe, {
        ref: globeEl,
        width: size.width,
        height: size.height,
        backgroundColor: navy.css,
        rendererConfig: { antialias: true, alpha: false },
        globeImageUrl:
          "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg",
        animateIn: true,
        showAtmosphere: true,
        atmosphereColor: "rgba(196, 154, 74, 0.22)",
        atmosphereAltitude: 0.12,
        enablePointerInteraction: false,
        onGlobeReady: () => {
          if (globeEl.current) {
            configureGlobe(globeEl.current);
            applyGlobeBackground(globeEl.current);
          }
        },
        arcsData: routes,
        arcStartLat: (d) => +d.srcAirport.lat,
        arcStartLng: (d) => +d.srcAirport.lng,
        arcEndLat: (d) => +d.dstAirport.lat,
        arcEndLng: (d) => +d.dstAirport.lng,
        arcAltitudeAutoScale: 0.5,
        arcStroke: 0.55,
        arcDashLength: 0.35,
        arcDashGap: 0.8,
        arcDashInitialGap: () => Math.random(),
        arcDashAnimateTime: 3500,
        arcColor: () => ["rgba(196, 154, 74, 0.85)", "rgba(212, 170, 90, 0.25)"],
        arcsTransitionDuration: 0,
        pointsData: [],
      }),
    );
  }

  const MOBILE_MEDIA = "(max-width: 768px)";

  function isMobileViewport() {
    return window.matchMedia(MOBILE_MEDIA).matches;
  }

  function initGlobeViz() {
    const container = document.getElementById("globeViz");
    if (!container || isMobileViewport()) return;

    if (
      typeof React === "undefined" ||
      typeof ReactDOM === "undefined" ||
      typeof Globe === "undefined"
    ) {
      setTimeout(initGlobeViz, 50);
      return;
    }

    if (container.dataset.initialized === "true") return;
    container.dataset.initialized = "true";

    ReactDOM.createRoot(container).render(React.createElement(GlobeWorld));
  }

  let mobileMediaListenerAttached = false;

  function setupGlobeInit() {
    initGlobeViz();
    if (mobileMediaListenerAttached) return;
    mobileMediaListenerAttached = true;
    window.matchMedia(MOBILE_MEDIA).addEventListener("change", initGlobeViz);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupGlobeInit);
  } else {
    setupGlobeInit();
  }

  document.addEventListener("astro:page-load", setupGlobeInit);
})();
