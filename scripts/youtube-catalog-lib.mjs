import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_YT_DLP_EXECUTABLE = "yt-dlp";
export const PLAYLIST_CATEGORIES = ["ost", "opening", "ending"];
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizeAliasKey = (value) =>
  normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const slugify = (value) =>
  normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

export const toVideoId = (value) => {
  const videoId = String(value ?? "").trim();
  return VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
};

export const classifyVideo = (entry) => {
  const title = String(entry.title ?? "").trim();
  const searchableTitle = normalizeText(title);
  const liveStatus = normalizeText(entry.live_status);

  if (
    entry.is_live === true ||
    ["is_live", "is_upcoming", "post_live"].includes(liveStatus) ||
    /\blive\b|livestream|streaming/.test(searchableTitle)
  ) {
    return { kind: "skip", reason: "live-stream" };
  }

  if (
    /\breaction\b|\breactions\b|\breacts?\b|commentary|review|analysis|explained/.test(
      searchableTitle,
    )
  ) {
    return { kind: "skip", reason: "reaction-or-commentary" };
  }

  if (
    /\bmix\b|\bcompilation\b|\bnon[ -]?stop\b|\bfull album\b|\ball songs\b|\bsoundtrack collection\b|\bplaylist\b|\b\d+ ?hours?\b/.test(
      searchableTitle,
    )
  ) {
    return { kind: "skip", reason: "mix-or-compilation" };
  }

  const ambiguousFlags = [
    "cover",
    "remix",
    "medley",
    "nightcore",
    "slowed",
    "sped up",
    "extended",
    "piano",
    "amv",
    "fan made",
    "instrumental",
  ].filter((flag) => searchableTitle.includes(flag));

  return ambiguousFlags.length > 0
    ? { kind: "ambiguous", flags: ambiguousFlags }
    : { kind: "retain" };
};

const readProcessOutput = (executable, args, { timeoutMs = 180_000 } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`yt-dlp timed out after ${timeoutMs}ms`));
      settled = true;
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (!settled) reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (settled) return;
      if (code !== 0) {
        reject(
          new Error(
            `yt-dlp failed with ${signal ? `signal ${signal}` : `exit code ${code}`}: ${stderr.trim()}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });

export const extractPlaylistMetadata = async (
  playlistUrl,
  {
    executable = DEFAULT_YT_DLP_EXECUTABLE,
    timeoutMs = 180_000,
    run = readProcessOutput,
  } = {},
) => {
  const stdout = await run(
    executable,
    [
      "--dump-single-json",
      "--skip-download",
      "--ignore-errors",
      "--no-warnings",
      "--no-progress",
      "--no-check-certificates",
      playlistUrl,
    ],
    { timeoutMs },
  );

  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `yt-dlp returned invalid JSON for ${playlistUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!payload || !Array.isArray(payload.entries)) {
    throw new Error(`yt-dlp did not return playlist entries for ${playlistUrl}`);
  }

  return payload;
};

const toAlias = (alias) => {
  if (typeof alias === "string") {
    return alias.trim() ? { value: alias.trim(), match: "fuzzy" } : null;
  }
  if (!alias || typeof alias.value !== "string" || !alias.value.trim()) return null;
  return {
    value: alias.value.trim(),
    match: alias.match === "exact" ? "exact" : "fuzzy",
  };
};

export const mergeAnswerAliases = (members) => {
  const aliases = new Map();
  for (const member of members) {
    const values = [
      ...(Array.isArray(member.answerAliases) ? member.answerAliases : []),
      member.canonicalTitle,
      member.name,
      member.romajiName,
      member.nativeName,
    ];
    for (const value of values) {
      const alias = toAlias(value);
      if (!alias) continue;
      const key = normalizeAliasKey(alias.value);
      if (!key) continue;
      const existing = aliases.get(key);
      if (!existing || (existing.match === "fuzzy" && alias.match === "exact")) {
        aliases.set(key, alias);
      }
    }
  }
  return [...aliases.values()].sort((left, right) => {
    if (left.match !== right.match) return left.match === "exact" ? -1 : 1;
    return left.value.localeCompare(right.value);
  });
};

const toViewCount = (entry) =>
  Number.isInteger(entry.view_count) && entry.view_count >= 0
    ? entry.view_count
    : null;

const toDurationSeconds = (entry) =>
  isFiniteNumber(entry.duration) && entry.duration > 0
    ? Math.round(entry.duration)
    : undefined;

const compareRankCandidates = (left, right) => {
  const leftHasViews = left.viewCount !== null;
  const rightHasViews = right.viewCount !== null;
  if (leftHasViews !== rightHasViews) return leftHasViews ? -1 : 1;
  if (leftHasViews && rightHasViews && left.viewCount !== right.viewCount) {
    return right.viewCount - left.viewCount;
  }
  if (left.playlistOrder !== right.playlistOrder) {
    return left.playlistOrder - right.playlistOrder;
  }
  return left.videoId.localeCompare(right.videoId);
};

const makeTrackId = (canonicalAnimeId, videoId) =>
  `${slugify(canonicalAnimeId) || "anime"}-${videoId}`;

export const validateMapping = (mapping, canonicalIds) => {
  const errors = [];
  if (!mapping || mapping.version !== 1 || !Array.isArray(mapping.entries)) {
    return ["Mapping must have version 1 and an entries array."];
  }

  const canonicalIdSet = new Set(canonicalIds);
  const seenPairs = new Set();
  const coveredIds = new Set();

  mapping.entries.forEach((entry, index) => {
    const label = `mapping entry ${index + 1}`;
    if (!entry || typeof entry !== "object") {
      errors.push(`${label} must be an object.`);
      return;
    }
    if (!canonicalIdSet.has(entry.canonicalAnimeId)) {
      errors.push(`${label} references unknown canonical anime ${entry.canonicalAnimeId}.`);
    } else {
      coveredIds.add(entry.canonicalAnimeId);
    }
    if (typeof entry.playlistUrl !== "string" || !/^https?:\/\/(?:www\.)?youtube\.com\/playlist\?list=/.test(entry.playlistUrl)) {
      errors.push(`${label} must use a YouTube playlist URL.`);
    }
    if (!PLAYLIST_CATEGORIES.includes(entry.category)) {
      errors.push(`${label} category must be ost, opening, or ending.`);
    }
    const pair = `${entry.canonicalAnimeId}\u0000${entry.playlistUrl}\u0000${entry.category}`;
    if (seenPairs.has(pair)) errors.push(`${label} duplicates an earlier mapping entry.`);
    seenPairs.add(pair);
  });

  for (const canonicalId of canonicalIds) {
    if (!coveredIds.has(canonicalId)) {
      errors.push(`Canonical anime ${canonicalId} has no playlist mapping.`);
    }
  }
  return errors;
};

export const buildCatalogFromPlaylists = async ({
  sourceCandidates,
  checklist,
  mapping,
  extract = extractPlaylistMetadata,
}) => {
  const report = {
    skippedVideos: [],
    ambiguousVideos: [],
    missingViewCounts: [],
    duplicateVideos: [],
    failedPlaylists: [],
    errors: [],
  };

  if (checklist?.approved !== true) {
    report.errors.push("The franchise checklist must be approved before importing.");
    return { catalog: null, report };
  }

  const groups = Array.isArray(checklist.groups) ? checklist.groups : [];
  const canonicalIds = groups.map((group) => group.canonicalAnimeId);
  report.errors.push(...validateMapping(mapping, canonicalIds));
  if (report.errors.length > 0) return { catalog: null, report };

  const sourceById = new Map(sourceCandidates.map((candidate) => [candidate.id, candidate]));
  const tracksByAnime = new Map(canonicalIds.map((id) => [id, []]));
  const videosById = new Map();
  let playlistOrder = 0;

  for (const entry of mapping.entries) {
    try {
      const payload = await extract(entry.playlistUrl);
      if (!payload || !Array.isArray(payload.entries) || payload.entries.length === 0) {
        throw new Error("yt-dlp returned an empty or invalid playlist");
      }
      for (const [entryIndex, video] of payload.entries.entries()) {
        if (!video) {
          report.skippedVideos.push({
            canonicalAnimeId: entry.canonicalAnimeId,
            playlistUrl: entry.playlistUrl,
            playlistIndex: entryIndex,
            reason: "unavailable-video",
          });
          continue;
        }
        const videoId = toVideoId(video.id);
        if (!videoId) {
          report.skippedVideos.push({
            canonicalAnimeId: entry.canonicalAnimeId,
            playlistUrl: entry.playlistUrl,
            playlistIndex: entryIndex,
            title: video.title ?? null,
            reason: "missing-video-id",
          });
          continue;
        }
        const classification = classifyVideo(video);
        if (classification.kind === "skip") {
          report.skippedVideos.push({
            canonicalAnimeId: entry.canonicalAnimeId,
            playlistUrl: entry.playlistUrl,
            playlistIndex: entryIndex,
            videoId,
            title: video.title ?? null,
            reason: classification.reason,
          });
          continue;
        }
        if (classification.kind === "ambiguous") {
          report.ambiguousVideos.push({
            canonicalAnimeId: entry.canonicalAnimeId,
            playlistUrl: entry.playlistUrl,
            playlistIndex: entryIndex,
            videoId,
            title: video.title ?? null,
            flags: classification.flags,
          });
        }

        const viewCount = toViewCount(video);
        const track = {
          videoId,
          title: String(video.title ?? videoId),
          ...(toDurationSeconds(video) === undefined
            ? {}
            : { durationSeconds: toDurationSeconds(video) }),
          viewCount,
          category: entry.category,
          playlistOrder: playlistOrder++,
          playlistUrl: entry.playlistUrl,
        };
        if (viewCount === null) {
          report.missingViewCounts.push({
            canonicalAnimeId: entry.canonicalAnimeId,
            playlistUrl: entry.playlistUrl,
            playlistIndex: entryIndex,
            videoId,
            title: track.title,
          });
        }

        const existingVideo = videosById.get(videoId);
        if (existingVideo && existingVideo.canonicalAnimeId !== entry.canonicalAnimeId) {
          report.errors.push(
            `Video ${videoId} is mapped to both ${existingVideo.canonicalAnimeId} and ${entry.canonicalAnimeId}.`,
          );
          continue;
        }
        videosById.set(videoId, {
          canonicalAnimeId: entry.canonicalAnimeId,
          category: entry.category,
        });

        const tracks = tracksByAnime.get(entry.canonicalAnimeId);
        const duplicate = tracks?.find((candidate) => candidate.videoId === videoId);
        if (duplicate) {
          if (duplicate.category !== entry.category) {
            report.errors.push(
              `Video ${videoId} has conflicting categories within ${entry.canonicalAnimeId}.`,
            );
          } else {
            report.duplicateVideos.push({
              canonicalAnimeId: entry.canonicalAnimeId,
              videoId,
              keptPlaylistUrl: duplicate.playlistUrl,
              duplicatePlaylistUrl: entry.playlistUrl,
            });
          }
          continue;
        }
        tracks?.push(track);
      }
    } catch (error) {
      report.failedPlaylists.push({
        canonicalAnimeId: entry.canonicalAnimeId,
        playlistUrl: entry.playlistUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (report.failedPlaylists.length > 0) {
    report.errors.push("At least one required playlist could not be accessed.");
  }
  if (report.errors.length > 0) return { catalog: null, report };

  const catalog = [];
  for (const group of groups) {
    const primaryId = group.primary?.id ?? group.canonicalAnimeId;
    const sourcePrimary = sourceById.get(primaryId);
    const primary = sourcePrimary ?? {
      id: primaryId,
      anilistId: group.primary?.anilistId,
      mode: "anime",
      name: group.primary?.name ?? group.primary?.canonicalTitle ?? primaryId,
      canonicalTitle: group.primary?.canonicalTitle ?? group.primary?.name ?? primaryId,
      romajiName: group.primary?.romajiName ?? null,
      nativeName: group.primary?.nativeName ?? null,
      coverImageUrl: group.primary?.coverImageUrl ?? "",
      answerAliases: [],
      tracks: [],
    };
    const tracks = [...(tracksByAnime.get(group.canonicalAnimeId) ?? [])].sort(compareRankCandidates);
    if (tracks.length === 0) {
      report.errors.push(`Canonical anime ${group.canonicalAnimeId} produced no retained tracks.`);
      continue;
    }
    const members = Array.isArray(group.members) ? group.members : [primary];
    const aliases = mergeAnswerAliases(members);
    catalog.push({
      ...primary,
      id: group.canonicalAnimeId,
      anilistId: primary.anilistId,
      name: group.primary?.name ?? primary.name,
      canonicalTitle: group.primary?.canonicalTitle ?? primary.canonicalTitle,
      romajiName: group.primary?.romajiName ?? primary.romajiName,
      nativeName: group.primary?.nativeName ?? primary.nativeName,
      coverImageUrl: group.primary?.coverImageUrl ?? primary.coverImageUrl,
      answerAliases: aliases,
      tracks: tracks.map((track, index) => ({
        id: makeTrackId(group.canonicalAnimeId, track.videoId),
        videoId: track.videoId,
        title: track.title,
        ...(track.durationSeconds === undefined
          ? {}
          : { durationSeconds: track.durationSeconds }),
        viewCount: track.viewCount,
        easyModeRank: index + 1,
        category: track.category,
      })),
    });
  }

  if (report.errors.length > 0) return { catalog: null, report };
  return { catalog, report };
};

export const loadJson = async (filePath) =>
  JSON.parse(await readFile(path.resolve(filePath), "utf8"));

export const writeJson = async (filePath, value) =>
  writeFile(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`);
