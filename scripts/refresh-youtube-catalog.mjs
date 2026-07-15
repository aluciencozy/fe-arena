import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { toTsCatalog } from "./generate-anilist-catalog.mjs";
import {
  buildCatalogFromPlaylists,
  loadJson,
  writeJson,
} from "./youtube-catalog-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const SOURCE_JSON = path.join(DATA_DIR, "anilist-anime-candidates.json");
const CHECKLIST_JSON = path.join(DATA_DIR, "anime-franchise-checklist.json");
const MAPPING_JSON = path.join(DATA_DIR, "youtube-playlist-mapping.local.json");
const OUTPUT_JSON = path.join(DATA_DIR, "anilist-anime-candidates.json");
const OUTPUT_TS = path.join(DATA_DIR, "anilist-anime-candidates.catalog.ts");
const REPORT_JSON = path.join(DATA_DIR, "youtube-catalog-import-report.local.json");

const getArgument = (name, fallback) => {
  const prefix = `${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
};

const main = async () => {
  const sourcePath = path.resolve(getArgument("--source", SOURCE_JSON));
  const checklistPath = path.resolve(getArgument("--checklist", CHECKLIST_JSON));
  const mappingPath = path.resolve(getArgument("--mapping", MAPPING_JSON));
  const outputPath = path.resolve(getArgument("--output", OUTPUT_JSON));
  const reportPath = path.resolve(getArgument("--report", REPORT_JSON));
  const [source, checklist] = await Promise.all([
    loadJson(sourcePath),
    loadJson(checklistPath),
  ]);
  let mapping;
  try {
    mapping = await loadJson(mappingPath);
  } catch (error) {
    const report = {
      generatedAt: new Date().toISOString(),
      sourcePath,
      checklistPath,
      mappingPath,
      canonicalAnimeCount: checklist.groups?.length ?? 0,
      retainedTrackCount: 0,
      skippedVideos: [],
      ambiguousVideos: [],
      missingViewCounts: [],
      duplicateVideos: [],
      failedPlaylists: [],
      errors: [`Could not read playlist mapping: ${error instanceof Error ? error.message : String(error)}`],
    };
    await writeJson(reportPath, report);
    throw new Error(`Catalog refresh aborted. See ${reportPath}.\n${report.errors[0]}`);
  }
  const result = await buildCatalogFromPlaylists({
    sourceCandidates: source.candidates ?? [],
    checklist,
    mapping,
  });
  const report = {
    generatedAt: new Date().toISOString(),
    sourcePath,
    checklistPath,
    mappingPath,
    canonicalAnimeCount: checklist.groups?.length ?? 0,
    retainedTrackCount: result.catalog?.reduce((total, title) => total + title.tracks.length, 0) ?? 0,
    ...result.report,
  };
  await writeJson(reportPath, report);
  if (!result.catalog) {
    throw new Error(`Catalog refresh aborted. See ${reportPath}.\n${report.errors.join("\n")}`);
  }

  const nextSource = {
    ...source,
    generatedAt: new Date().toISOString(),
    source: "AniList GraphQL API for identity; YouTube playlists for tracks",
    uniqueCount: result.catalog.length,
    candidates: result.catalog,
  };
  await writeJson(outputPath, nextSource);
  await writeFile(OUTPUT_TS, toTsCatalog(result.catalog));
  console.log(`Replaced ${outputPath} with ${result.catalog.length} canonical anime.`);
  console.log(`Regenerated ${OUTPUT_TS}.`);
  console.log(`Report: ${reportPath}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
