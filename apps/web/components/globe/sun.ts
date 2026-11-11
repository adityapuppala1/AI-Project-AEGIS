// Small clock helpers for the public pages' globe. Kept apart from the 3D code so the pages can show the time and
// "day or night over India" without loading three.js first.
const RAD = Math.PI / 180;

/** Where the sun is overhead at this moment, as [longitude, latitude], to a degree or so. */
export function subsolar(date: Date): [number, number] {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0), day = (date.getTime() - start) / 86400000;
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return [((12 - hours) * 15 + 540) % 360 - 180, -23.44 * Math.cos((2 * Math.PI / 365) * (day + 10))];
}

/** Whether the middle of India (22N 79E) is in daylight at this moment. */
export function indiaDaylight(date: Date): "day" | "night" | "twilight" {
  const [lon, lat] = subsolar(date);
  const lit = Math.sin(lat * RAD) * Math.sin(22 * RAD) + Math.cos(lat * RAD) * Math.cos(22 * RAD) * Math.cos((lon - 79) * RAD);
  if (lit > 0.12) return "day";
  return lit < -0.1 ? "night" : "twilight";
}

/** Indian Standard Time as HH:MM, without depending on the visitor's locale data. */
export function istClock(date: Date): string {
  const shifted = new Date(date.getTime() + 330 * 60000), pad = (n: number) => String(n).padStart(2, "0");
  return pad(shifted.getUTCHours()) + ":" + pad(shifted.getUTCMinutes());
}
