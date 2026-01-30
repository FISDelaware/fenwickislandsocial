import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ROOT = process.cwd();

const FILE_RESTAURANTS = path.join(ROOT, "src/data/restaurants.json");
const FILE_AREAS = path.join(ROOT, "src/data/areas.json");
const FILE_CUISINES = path.join(ROOT, "src/data/cuisines.json");
const PLACEHOLDER = path.join(ROOT, "public/images/placeholder.jpg");

function slugify(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

async function readJson(file) {
  const txt = await fs.readFile(file, "utf-8");
  return JSON.parse(txt);
}

async function writeJson(file, data) {
  const txt = JSON.stringify(data, null, 2) + "\n";
  await fs.writeFile(file, txt, "utf-8");
}

function parseList(inputStr) {
  return String(inputStr || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function extractAreaKeys(areasJson) {
  // supports either [{ key, name }] or [{ id, name }] styles
  if (!Array.isArray(areasJson)) return [];
  return areasJson
    .map(a => a?.key ?? a?.id ?? a?.slug ?? null)
    .filter(Boolean);
}

function extractCuisineNames(cuisinesJson) {
  // supports either [{ name }] or [{ key, name }] styles or plain array of strings
  if (Array.isArray(cuisinesJson)) {
    if (cuisinesJson.length && typeof cuisinesJson[0] === "string") return cuisinesJson;
    return cuisinesJson.map(c => c?.name ?? c?.key ?? c?.id ?? null).filter(Boolean);
  }
  return [];
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyPlaceholderIfExists(destFile) {
  try {
    await fs.access(PLACEHOLDER);
    await fs.copyFile(PLACEHOLDER, destFile);
    return true;
  } catch {
    return false;
  }
}

function yesNoToBool(s, defaultVal = false) {
  const v = String(s || "").trim().toLowerCase();
  if (!v) return defaultVal;
  if (["y", "yes", "true", "1"].includes(v)) return true;
  if (["n", "no", "false", "0"].includes(v)) return false;
  return defaultVal;
}

async function main() {
  const rl = readline.createInterface({ input, output });

  try {
    const restaurants = await readJson(FILE_RESTAURANTS);
    if (!Array.isArray(restaurants)) throw new Error("restaurants.json must be a JSON array.");

    const areas = await readJson(FILE_AREAS);
    const areaKeys = extractAreaKeys(areas);

    const cuisinesJson = await readJson(FILE_CUISINES);
    const cuisineNames = extractCuisineNames(cuisinesJson);

    console.log("\n=== Add a Restaurant (Fenwick Island Social) ===\n");

    const name = (await rl.question("Restaurant name: ")).trim();
    if (!name) throw new Error("Name is required.");

    let slug = slugify(await rl.question(`Slug (Enter to auto: "${slugify(name)}"): `)) || slugify(name);
    if (!slug) throw new Error("Could not generate slug.");

    // Ensure unique slug
    const existing = new Set(restaurants.map(r => r?.slug).filter(Boolean));
    if (existing.has(slug)) {
      const suffix = Date.now().toString().slice(-5);
      slug = `${slug}-${suffix}`;
      console.log(`Slug already exists. Using: ${slug}`);
    }

    console.log("\nAvailable area keys:");
    console.log(areaKeys.length ? "  " + areaKeys.join(", ") : "  (Could not detect area keys; you can still type one.)");
    const areaKey = (await rl.question("areaKey (example: fenwick-island): ")).trim();
    if (!areaKey) throw new Error("areaKey is required.");
    if (areaKeys.length && !areaKeys.includes(areaKey)) {
      console.log(`⚠️  Warning: "${areaKey}" not found in src/data/areas.json keys. (Proceeding anyway.)`);
    }

    const address = (await rl.question('Address (short, e.g. "Fenwick Island, DE"): ')).trim() || "";
    const price = (await rl.question('Price ($, $$, $$$) [default $$]: ')).trim() || "$$";

    console.log("\nCuisine suggestions (from cuisines.json):");
    console.log(cuisineNames.length ? "  " + cuisineNames.join(", ") : "  (No cuisine names detected; type your own.)");
    const cuisines = parseList(await rl.question('Cuisines (comma-separated, e.g. "BBQ, Seafood"): '));
    if (!cuisines.length) throw new Error("At least one cuisine is required.");

    const vibes = parseList(await rl.question('Vibes (comma-separated, e.g. "Casual, Waterfront / View"): '));
    const goodFor = parseList(await rl.question('Good for (comma-separated, e.g. "Groups, Date night"): '));

    const shortBlurb = (await rl.question("Short blurb (1 sentence): ")).trim() || "";
    const longBlurb = (await rl.question("Long blurb (2–4 sentences): ")).trim() || "";

    const mustTry = parseList(await rl.question('Must-try (comma-separated, e.g. "Brisket, Ribs"): '));

    const website = (await rl.question("Website URL (optional): ")).trim() || "";
    const menuUrl = (await rl.question("Menu URL (optional): ")).trim() || "";

    const featured = yesNoToBool(await rl.question("Featured on homepage? (y/N): "), false);

    // Photo path convention
    const photoFolder = path.join(ROOT, "public/images/restaurants", slug);
    await ensureDir(photoFolder);

    const firstPhotoRel = `/images/restaurants/${slug}/1.jpg`;
    const firstPhotoAbs = path.join(photoFolder, "1.jpg");

    // If no photo exists yet, copy placeholder to 1.jpg so it renders immediately
    try {
      await fs.access(firstPhotoAbs);
    } catch {
      const copied = await copyPlaceholderIfExists(firstPhotoAbs);
      if (copied) {
        console.log(`✅ Created ${firstPhotoRel} from placeholder.jpg (replace it later with your real photo).`);
      } else {
        console.log(`⚠️  placeholder.jpg not found, so no default 1.jpg created. Add your own photo at ${firstPhotoAbs}`);
      }
    }

    const entry = {
      name,
      slug,
      areaKey,
      address,
      price,
      cuisines,
      vibes,
      goodFor,
      shortBlurb,
      longBlurb,
      mustTry,
      website,
      menuUrl,
      photos: [firstPhotoRel],
      featured
    };

    restaurants.push(entry);
    await writeJson(FILE_RESTAURANTS, restaurants);

    console.log("\n✅ Added restaurant:");
    console.log(`   Name: ${name}`);
    console.log(`   Slug: ${slug}`);
    console.log(`   URL:  /restaurants/${slug}`);
    console.log(`   Photo folder: public/images/restaurants/${slug}/`);
    console.log("\nNext:");
    console.log("  1) Add/replace photo: public/images/restaurants/" + slug + "/1.jpg");
    console.log("  2) Run: npm run dev");
    console.log('  3) Deploy: git add -A && git commit -m "Add ' + name.replace(/"/g, '\\"') + '" && git push');
    console.log("");
  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error("\n❌ Add failed:", err?.message || err);
  process.exit(1);
});
