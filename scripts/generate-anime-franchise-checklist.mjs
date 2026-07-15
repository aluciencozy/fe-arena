import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_JSON = path.join(ROOT, "data", "anilist-anime-candidates.json");
const OUTPUT_JSON = path.join(ROOT, "data", "anime-franchise-checklist.json");
const BATCH_SIZE = 50;
const REQUEST_RETRIES = 5;
const REQUEST_DELAY_MS = 1_000;

const QUERY = `
  query AnimeRelations($ids: [Int!]) {
    Page(page: 1, perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        title { english romaji native userPreferred }
        coverImage { extraLarge large }
        relations {
          edges {
            relationType
            node {
              id
              type
              title { english romaji native userPreferred }
              coverImage { extraLarge large }
            }
          }
        }
      }
    }
  }
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const titleValue = (title) =>
  title?.english || title?.romaji || title?.userPreferred || title?.native || null;

const toMetadata = (media) => ({
  anilistId: media.id,
  name: titleValue(media.title),
  canonicalTitle: titleValue(media.title),
  romajiName: media.title?.romaji ?? null,
  nativeName: media.title?.native ?? null,
  coverImageUrl: media.coverImage?.extraLarge || media.coverImage?.large || "",
});

const fetchRelations = async (ids) => {
  const results = new Map();
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE);
    let response;
    for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt += 1) {
      response = await fetch(ANILIST_GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "guess-the-ost-catalog/1.0",
        },
        body: JSON.stringify({ query: QUERY, variables: { ids: batch } }),
      });
      if (response.status !== 429 || attempt === REQUEST_RETRIES) break;
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1_000
        : Math.min(60_000, REQUEST_DELAY_MS * 2 ** attempt);
      console.warn(`AniList rate limited; retrying in ${delay}ms.`);
      await sleep(delay);
    }
    if (!response.ok) {
      throw new Error(`AniList request failed (${response.status} ${response.statusText})`);
    }
    const payload = await response.json();
    if (payload.errors) throw new Error(JSON.stringify(payload.errors));
    for (const media of payload.data?.Page?.media ?? []) results.set(media.id, media);
    if (index + BATCH_SIZE < ids.length) await sleep(REQUEST_DELAY_MS);
  }
  return results;
};

const addAliasFields = (candidate) => ({
  ...candidate,
  answerAliases: Array.isArray(candidate.answerAliases) ? candidate.answerAliases : [],
});

const buildChecklist = (source, relationMedia) => {
  const sourceCandidates = source.candidates ?? [];
  const metadataById = new Map();
  for (const candidate of sourceCandidates) metadataById.set(candidate.anilistId, addAliasFields(candidate));
  for (const media of relationMedia.values()) {
    if (!metadataById.has(media.id)) metadataById.set(media.id, toMetadata(media));
  }

  const adjacency = new Map();
  const relationTypes = new Map();
  for (const media of relationMedia.values()) {
    const mediaEdges = adjacency.get(media.id) ?? new Set();
    for (const edge of media.relations?.edges ?? []) {
      if (edge.node?.type !== "ANIME") continue;
      const relatedId = edge.node.id;
      metadataById.set(relatedId, metadataById.get(relatedId) ?? toMetadata(edge.node));
      mediaEdges.add(relatedId);
      const relatedEdges = adjacency.get(relatedId) ?? new Set();
      relatedEdges.add(media.id);
      adjacency.set(relatedId, relatedEdges);
      relationTypes.set(`${media.id}:${relatedId}`, [
        ...(relationTypes.get(`${media.id}:${relatedId}`) ?? []),
        edge.relationType,
      ]);
    }
    adjacency.set(media.id, mediaEdges);
  }

  const visited = new Set();
  const groups = [];
  const sourceOrder = new Map(sourceCandidates.map((candidate, index) => [candidate.anilistId, index]));
  for (const candidate of sourceCandidates) {
    if (visited.has(candidate.anilistId)) continue;
    const component = [];
    const pending = [candidate.anilistId];
    visited.add(candidate.anilistId);
    while (pending.length > 0) {
      const id = pending.pop();
      component.push(id);
      for (const relatedId of adjacency.get(id) ?? []) {
        if (!visited.has(relatedId)) {
          visited.add(relatedId);
          pending.push(relatedId);
        }
      }
    }
    component.sort((left, right) => {
      const leftOrder = sourceOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left - right;
    });
    const primary = metadataById.get(component[0]);
    if (!primary) throw new Error(`Missing metadata for AniList entry ${component[0]}`);
    const members = component.map((id) => {
      const member = metadataById.get(id);
      return {
        ...member,
        id: member.id ?? `anilist-${id}`,
        relationTypes: [
          ...new Set([
            ...(relationTypes.get(`${id}:${component[0]}`) ?? []),
            ...(relationTypes.get(`${component[0]}:${id}`) ?? []),
          ]),
        ],
      };
    });
    groups.push({
      canonicalAnimeId: primary.id ?? `anilist-${primary.anilistId}`,
      primary: {
        id: primary.id ?? `anilist-${primary.anilistId}`,
        anilistId: primary.anilistId,
        name: primary.name,
        canonicalTitle: primary.canonicalTitle,
        romajiName: primary.romajiName ?? null,
        nativeName: primary.nativeName ?? null,
        coverImageUrl: primary.coverImageUrl ?? "",
      },
      memberAnimeIds: component,
      members,
    });
  }
  return groups;
};

const main = async () => {
  const source = JSON.parse(await readFile(INPUT_JSON, "utf8"));
  const sourceIds = (source.candidates ?? []).map((candidate) => candidate.anilistId);
  const fetched = new Map();
  let pending = [...sourceIds];
  while (pending.length > 0) {
    const relations = await fetchRelations(pending);
    const next = [];
    for (const [id, media] of relations) {
      fetched.set(id, media);
      for (const edge of media.relations?.edges ?? []) {
        if (edge.node?.type === "ANIME" && !fetched.has(edge.node.id)) next.push(edge.node.id);
      }
    }
    pending = [...new Set(next)];
  }
  const groups = buildChecklist(source, fetched);
  const output = {
    generatedAt: new Date().toISOString(),
    source: "AniList GraphQL API relations",
    sourceCandidateCount: sourceIds.length,
    approved: false,
    approvalNotes: "Review group membership and primary entries, then set approved to true.",
    groups,
  };
  await mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await writeFile(OUTPUT_JSON, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${groups.length} proposed franchise groups from ${sourceIds.length} AniList candidates.`);
  console.log(`Checklist: ${OUTPUT_JSON}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
