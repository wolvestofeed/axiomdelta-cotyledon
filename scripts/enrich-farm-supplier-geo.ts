/**
 * Cotyledon — supplier geo-enrichment.
 *
 * Adds { lat, lng, geoSource } to every record in suppliers-compiled.json so
 * the Suppliers map tab can drop a pin per producer. Fully in-house / free:
 * coordinates come from the U.S. Census Bureau Gazetteer files (PUBLIC DOMAIN),
 * not a geocoding API. No runtime external calls — this bakes coordinates into
 * the committed compilation.
 *
 * Resolution is intentionally coarse: a producer pins to its ZIP-code centroid
 * (town level), or its county centroid when no 5-digit ZIP is on file. That is
 * the right precision for a supplier directory — the source directories carry
 * no exact farm coordinates, and we never fabricate them.
 *
 * Sources (2023 Gazetteer):
 *   ZCTA:     https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_zcta_national.zip
 *   Counties: https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_counties_national.zip
 *
 * Run:  pnpm farm:supplier-geo
 *   Expects the two extracted .txt files. Override paths with env vars
 *   CT_GAZ_ZCTA / CT_GAZ_COUNTIES; defaults point at /tmp extractions.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const JSON_PATH = path.join(REPO, 'src/data/suppliers-compiled.json');

const ZCTA_TXT = process.env.CT_GAZ_ZCTA ?? '/tmp/czcta/2023_Gaz_zcta_national.txt';
const COUNTY_TXT = process.env.CT_GAZ_COUNTIES ?? '/tmp/ccounty/2023_Gaz_counties_national.txt';

const normCounty = (c: string) =>
  c.replace(/\s+county$/i, '').replace(/\s+parish$/i, '').trim().toUpperCase();

// --- ZIP centroid lookup (GEOID -> [lat, lng]) ---
function loadZctaCentroids(): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  const lines = fs.readFileSync(ZCTA_TXT, 'utf8').split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 7) continue;
    const zip = cols[0].trim();
    const lat = parseFloat(cols[5]);
    const lng = parseFloat(cols[6]);
    if (zip && Number.isFinite(lat) && Number.isFinite(lng)) m.set(zip, [lat, lng]);
  }
  return m;
}

// --- County centroid lookup ("TX|TRAVIS" -> [lat, lng]) ---
function loadCountyCentroids(): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  const lines = fs.readFileSync(COUNTY_TXT, 'utf8').split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 10) continue;
    const usps = cols[0].trim();
    const name = cols[3].trim();
    const lat = parseFloat(cols[8]);
    const lng = parseFloat(cols[9]);
    if (usps && name && Number.isFinite(lat) && Number.isFinite(lng)) {
      m.set(`${usps}|${normCounty(name)}`, [lat, lng]);
    }
  }
  return m;
}

interface Op {
  zip?: string;
  county?: string;
  state?: string;
  lat?: number;
  lng?: number;
  geoSource?: 'zip' | 'county' | null;
  [k: string]: unknown;
}

function main() {
  const zcta = loadZctaCentroids();
  const county = loadCountyCentroids();
  const dataset = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) as { operations: Op[] };

  let byZip = 0;
  let byCounty = 0;
  let none = 0;

  for (const o of dataset.operations) {
    const zip = (o.zip ?? '').match(/\d{5}/)?.[0];
    const zc = zip ? zcta.get(zip) : undefined;
    if (zc) {
      o.lat = zc[0];
      o.lng = zc[1];
      o.geoSource = 'zip';
      byZip++;
      continue;
    }
    const cc =
      o.state && o.county ? county.get(`${o.state.toUpperCase()}|${normCounty(o.county)}`) : undefined;
    if (cc) {
      o.lat = cc[0];
      o.lng = cc[1];
      o.geoSource = 'county';
      byCounty++;
      continue;
    }
    o.lat = undefined;
    o.lng = undefined;
    o.geoSource = null;
    none++;
  }

  fs.writeFileSync(JSON_PATH, JSON.stringify(dataset, null, 2) + '\n');
  console.log(
    `geo-enriched ${dataset.operations.length} operations — zip:${byZip} county:${byCounty} none:${none}`,
  );
}

main();
