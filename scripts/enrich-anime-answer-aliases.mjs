import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const INPUT_JSON = path.resolve("data", "anilist-anime-candidates.json");

const QUERY = `
  query AnimeSynonyms($ids: [Int]) {
    Page(page: 1, perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        title {
          romaji
          english
          native
          userPreferred
        }
        synonyms
      }
    }
  }
`;

const CURATED_EXACT_ALIASES = new Map(
  Object.entries({
    20: ["naruto"],
    21: ["op"],
    1535: ["dn"],
    1575: ["cg"],
    16498: ["aot"],
    19815: ["ngnl"],
    20583: ["hxh"],
    20605: ["tg"],
    20755: ["ansatsu"],
    20899: ["jojo"],
    20958: ["aot s2", "aot season 2"],
    21087: ["opm"],
    21459: ["mha", "bnha"],
    21519: ["yn"],
    2167: ["clannad"],
    21856: ["mha s2", "bnha s2"],
    21881: ["food wars"],
    21889: ["danmachi"],
    97940: ["black clover"],
    99147: ["aot s3", "aot season 3"],
    99423: ["ditf"],
    101922: ["demon slayer"],
    108632: ["kny"],
    11061: ["hxh"],
    113415: ["jjk"],
    11757: ["sao"],
    120377: ["chainsaw man", "csm"],
    127230: ["csm"],
    130003: ["mushoku tensei"],
    13601: ["psycho pass"],
    136496: ["spy family", "sxf"],
    142329: ["spy family s2", "sxf s2"],
    1535: ["dn"],
    154587: ["frieren"],
    17074: ["monogatari"],
    1735: ["naruto shippuden"],
    18507: ["free"],
    19: ["monster"],
    2001: ["gurren lagann"],
    5114: ["fma", "fmab"],
    20507: ["noragami"],
    20594: ["haikyuu"],
    20665: ["yli april"],
    20729: ["jjba"],
    20785: ["fate ubw"],
    20801: ["noragami aragoto"],
    20853: ["assclass"],
    20954: ["koe no katachi"],
    21185: ["konosuba"],
    21202: ["re zero", "rezero"],
    21355: ["re zero s2", "rezero s2"],
    21507: ["konosuba s2"],
    21557: ["mha"],
    21680: ["aot"],
    21745: ["sao ordinal scale"],
    21798: ["violet evergarden"],
    21827: ["slime isekai"],
    21827: ["tensei slime"],
    21931: ["violet evergarden"],
    97986: ["violet evergarden"],
    98444: ["mha s3", "bnha s3"],
    100166: ["violet evergarden movie"],
    100922: ["kaguya sama"],
    101280: ["vinland saga"],
    101759: ["promised neverland", "tpn"],
    102351: ["mob psycho 100 s2", "mp100 s2"],
    103871: ["aot s3 part 2", "aot season 3 part 2"],
    105333: ["dr stone"],
    106286: ["fruits basket"],
    108465: ["jjk 0"],
    109261: ["mha s4", "bnha s4"],
    110277: ["vinland saga s2"],
    112151: ["kaguya sama s2"],
    114129: ["aot final season", "aot s4"],
    116742: ["jjk s2"],
    117085: ["mushoku tensei"],
    119661: ["demon slayer movie", "mugen train"],
    119683: ["kaguya sama s3"],
    120120: ["oshi no ko"],
    127720: ["demon slayer s2"],
    131681: ["mha s5", "bnha s5"],
    131942: ["bleach tybw"],
    132052: ["spy family"],
    132171: ["aot final season part 2", "aot s4 part 2"],
    137822: ["demon slayer s3"],
    139630: ["mha s6", "bnha s6"],
    142838: ["blue lock"],
    145064: ["solo leveling"],
    146984: ["frieren"],
    150075: ["oshi no ko s2"],
    151807: ["demon slayer s4"],
    154454: ["jujutsu kaisen s2", "jjk s2"],
    154768: ["chainsaw man movie", "csm movie"],
    16498: ["aot"],
  }),
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeForDedupe = (value) =>
  value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const isAsciiPhrase = (value) => /^[\x00-\x7F]+$/.test(value);

const toTitleCaseAcronym = (value) => {
  if (!isAsciiPhrase(value)) return null;

  const words = normalizeForDedupe(value)
    .split(" ")
    .filter(Boolean)
    .filter((word) => /^[a-z0-9]+$/.test(word));

  if (words.length < 3 || words.length > 6) return null;
  return words.map((word) => word[0]).join("");
};

const stripSeasonNoise = (value) =>
  value
    .replace(/\b(?:season|part)\s*\d+\b/gi, "")
    .replace(/\b(?:saison|cour)\s*\d+\b/gi, "")
    .replace(/\b\d+(?:st|nd|rd|th)\s+season\b/gi, "")
    .replace(/\b(?:ova|ona|movie|tv|specials?|final season)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[-:|]+$/g, "")
    .trim();

const compactSeasonAlias = (value) => {
  const seasonMatch = value.match(/\bseason\s*(\d+)\b/i);
  if (!seasonMatch) return [];

  const base = stripSeasonNoise(value);
  const acronym = toTitleCaseAcronym(base);
  if (!acronym) return [];

  return [`${acronym} s${seasonMatch[1]}`, `${acronym} season ${seasonMatch[1]}`];
};

const toAliasObject = (value, match = "fuzzy") => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return { value: trimmed, match };
};

const addAlias = (aliasesByKey, value, match = "fuzzy") => {
  const alias = toAliasObject(value, match);
  if (!alias) return;

  const key = normalizeForDedupe(alias.value);
  if (!key) return;
  const existingAlias = aliasesByKey.get(key);
  if (!existingAlias || (existingAlias.match === "fuzzy" && alias.match === "exact")) {
    aliasesByKey.set(key, alias);
  }
};

const fetchSynonyms = async (ids) => {
  const response = await fetch(ANILIST_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { ids } }),
  });

  if (!response.ok) {
    throw new Error(`AniList request failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  if (payload.errors) throw new Error(JSON.stringify(payload.errors, null, 2));

  return payload.data.Page.media;
};

const chunk = (values, size) => {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const main = async () => {
  const resetExistingAliases = process.argv.includes("--reset");
  const payload = JSON.parse(await readFile(INPUT_JSON, "utf8"));
  const candidates = payload.candidates ?? [];
  const ids = candidates.map((candidate) => candidate.anilistId).filter(Boolean);
  const synonymsById = new Map();

  for (const idChunk of chunk(ids, 50)) {
    const mediaItems = await fetchSynonyms(idChunk);
    for (const media of mediaItems) {
      synonymsById.set(media.id, {
        synonyms: media.synonyms ?? [],
        titles: [
          media.title?.english,
          media.title?.romaji,
          media.title?.native,
          media.title?.userPreferred,
        ],
      });
    }
    await sleep(750);
  }

  for (const candidate of candidates) {
    const aliasesByKey = new Map();
    const aniListData = synonymsById.get(candidate.anilistId);
    const titleValues = [
      candidate.canonicalTitle,
      candidate.name,
      candidate.romajiName,
      candidate.nativeName,
      ...(aniListData?.titles ?? []),
    ].filter(Boolean);

    if (!resetExistingAliases) {
      for (const alias of candidate.answerAliases ?? []) {
        addAlias(aliasesByKey, alias.value, alias.match);
      }
    }

    for (const title of titleValues) {
      addAlias(aliasesByKey, title, "fuzzy");
      addAlias(aliasesByKey, stripSeasonNoise(title), "fuzzy");

      const acronym = toTitleCaseAcronym(title);
      if (acronym && acronym.length >= 3) addAlias(aliasesByKey, acronym, "exact");

      for (const seasonAlias of compactSeasonAlias(title)) {
        addAlias(aliasesByKey, seasonAlias, "exact");
      }
    }

    for (const synonym of aniListData?.synonyms ?? []) {
      addAlias(aliasesByKey, synonym, "fuzzy");
      addAlias(aliasesByKey, stripSeasonNoise(synonym), "fuzzy");
    }

    for (const exactAlias of CURATED_EXACT_ALIASES.get(String(candidate.anilistId)) ?? []) {
      addAlias(aliasesByKey, exactAlias, "exact");
    }

    candidate.answerAliases = [...aliasesByKey.values()].sort((a, b) => {
      if (a.match !== b.match) return a.match === "exact" ? -1 : 1;
      return a.value.localeCompare(b.value);
    });
  }

  payload.updatedAt = new Date().toISOString();
  await writeFile(INPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);

  const emptyAliases = candidates.filter((candidate) => candidate.answerAliases.length === 0);
  console.log(`Updated ${candidates.length} anime.`);
  console.log(`Anime with empty aliases: ${emptyAliases.length}`);
  console.log(`Total aliases: ${candidates.reduce((total, candidate) => total + candidate.answerAliases.length, 0)}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
