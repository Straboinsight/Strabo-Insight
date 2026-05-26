/**
 * US international outbound airline routes (OpenFlights data).
 * @see https://vasturiano.github.io/react-globe.gl/example/airline-routes/us-international-outbound.html
 */
import Globe from "globe.gl";
import { csvParseRows } from "d3-dsv";

const COUNTRY = "United States";
const OPACITY = 0.28;

type Airport = {
  iata: string;
  lat: string;
  lng: string;
  country: string;
};

type Route = {
  airline: string;
  srcIata: string;
  dstIata: string;
  stops: string;
  srcAirport?: Airport;
  dstAirport?: Airport;
};

const airportParse = ([, , , country, iata, , lat, lng]: string[]) => ({
  country,
  iata,
  lat,
  lng,
});

const routeParse = ([airline, , srcIata, , dstIata, , , stops]: string[]) => ({
  airline,
  srcIata,
  dstIata,
  stops,
});

function indexByIata(airports: Airport[]) {
  const map: Record<string, Airport> = {};
  for (const airport of airports) {
    if (airport.iata) map[airport.iata] = airport;
  }
  return map;
}

export function initGlobeViz() {
  const container = document.getElementById("globeViz");
  if (!container || container.dataset.initialized === "true") return;
  container.dataset.initialized = "true";

  const globe = new Globe(container)
    .backgroundColor("rgba(6, 15, 28, 0)")
    .globeImageUrl(
      "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg",
    )
    .showAtmosphere(true)
    .atmosphereColor("rgba(196, 154, 74, 0.15)")
    .atmosphereAltitude(0.12)
    .arcLabel(
      (d) =>
        `${(d as Route).airline}: ${(d as Route).srcIata} → ${(d as Route).dstIata}`,
    )
    .arcStartLat((d) => +(d as Route).srcAirport!.lat)
    .arcStartLng((d) => +(d as Route).srcAirport!.lng)
    .arcEndLat((d) => +(d as Route).dstAirport!.lat)
    .arcEndLng((d) => +(d as Route).dstAirport!.lng)
    .arcDashLength(0.25)
    .arcDashGap(1)
    .arcDashInitialGap(() => Math.random())
    .arcDashAnimateTime(4000)
    .arcColor(() => [
      `rgba(196, 154, 74, ${OPACITY})`,
      `rgba(122, 143, 160, ${OPACITY * 0.85})`,
    ])
    .arcsTransitionDuration(0)
    .pointColor(() => "#C49A4A")
    .pointAltitude(0)
    .pointRadius(0.02)
    .pointsMerge(true);

  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    globe.width(Math.max(width, 280)).height(Math.max(height, 280));
  };

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  globe.pointOfView({ lat: 39.6, lng: -98.5, altitude: 2 });

  Promise.all([
    fetch(
      "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat",
    ).then((res) => res.text()),
    fetch(
      "https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat",
    ).then((res) => res.text()),
  ])
    .then(([airportsText, routesText]) => {
      const airports = csvParseRows(airportsText, airportParse) as Airport[];
      const routes = csvParseRows(routesText, routeParse) as Route[];
      const byIata = indexByIata(airports);

      const filteredRoutes = routes
        .filter(
          (d) =>
            Object.prototype.hasOwnProperty.call(byIata, d.srcIata) &&
            Object.prototype.hasOwnProperty.call(byIata, d.dstIata),
        )
        .filter((d) => d.stops === "0")
        .map((d) => ({
          ...d,
          srcAirport: byIata[d.srcIata],
          dstAirport: byIata[d.dstIata],
        }))
        .filter(
          (d) =>
            d.srcAirport?.country === COUNTRY &&
            d.dstAirport?.country !== COUNTRY,
        );

      globe.arcsData(filteredRoutes).pointsData(airports);
    })
    .catch((err) => console.error("Failed to load globe route data:", err));
}
