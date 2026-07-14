import { anilistAnimeCandidates } from "../../../data/anilist-anime-candidates.catalog.js";
import type {
  AnswerOption,
  CatalogTitle,
  GameDifficulty,
} from "../types/index.js";
import { EASY_MODE_TRACK_LIMIT } from "../../../shared/game.constants.js";

type SourceTrack = (typeof anilistAnimeCandidates)[number]["tracks"][number];

const getEasyModeRank = (
  track: SourceTrack,
  index: number,
  hasExplicitRanks: boolean,
) => {
  if ("easyModeRank" in track && typeof track.easyModeRank === "number") {
    return track.easyModeRank;
  }

  if (hasExplicitRanks) return undefined;

  // The current catalog has no popularity metadata. Until tracks are curated,
  // use its existing order as a stable seed for the easy-mode pool.
  return index < EASY_MODE_TRACK_LIMIT ? index + 1 : undefined;
};

export const catalogTitles: CatalogTitle[] = anilistAnimeCandidates.map(
  (candidate) => {
    const hasExplicitRanks = candidate.tracks.some((track) =>
      "easyModeRank" in track,
    );
    return {
      id: candidate.id,
      mode: "anime",
      name: candidate.name,
      canonicalTitle: candidate.canonicalTitle,
      romajiName: candidate.romajiName,
      nativeName: candidate.nativeName,
      coverImageUrl: candidate.coverImageUrl,
      answerAliases: [...candidate.answerAliases],
      tracks: candidate.tracks.map((track, index) => {
        const easyModeRank = getEasyModeRank(
          track,
          index,
          hasExplicitRanks,
        );
        return {
          id: track.id,
          videoId: track.videoId,
          title: track.title,
          durationSeconds: track.durationSeconds,
          ...(easyModeRank === undefined ? {} : { easyModeRank }),
        };
      }),
    };
  },
);

export const getCatalogTitlesForMode = (mode: CatalogTitle["mode"]) =>
  catalogTitles.filter((title) => title.mode === mode);

export const getTracksForDifficulty = (
  title: CatalogTitle,
  difficulty: GameDifficulty = "standard",
) =>
  difficulty === "easy"
    ? title.tracks
        .filter(
          (track) =>
            typeof track.easyModeRank === "number" &&
            Number.isInteger(track.easyModeRank) &&
            track.easyModeRank >= 1 &&
            track.easyModeRank <= EASY_MODE_TRACK_LIMIT,
        )
        .sort((left, right) => left.easyModeRank! - right.easyModeRank!)
        .slice(0, EASY_MODE_TRACK_LIMIT)
    : title.tracks;

export const getPlayableTitlesForMode = (
  mode: CatalogTitle["mode"],
  difficulty: GameDifficulty = "standard",
) =>
  getCatalogTitlesForMode(mode).filter(
    (title) => getTracksForDifficulty(title, difficulty).length > 0,
  );

export const getTitlesForTitleIds = (
  mode: CatalogTitle["mode"],
  titleIds: string[],
  difficulty: GameDifficulty = "standard",
) => {
  const selectedIds = new Set(titleIds);
  return getPlayableTitlesForMode(mode, difficulty).filter((title) =>
    selectedIds.has(title.id),
  );
};

export const getAnswerOptionsForTitles = (
  titles: CatalogTitle[],
): AnswerOption[] =>
  titles.map((title) => ({
    id: title.id,
    canonicalTitle: title.canonicalTitle,
    romajiName: title.romajiName ?? null,
    nativeName: title.nativeName ?? null,
    coverImageUrl: title.coverImageUrl,
    searchTerms: [
      title.canonicalTitle,
      title.romajiName,
      title.nativeName,
      ...title.answerAliases.map((alias) => alias.value),
    ].filter((term): term is string => Boolean(term?.trim())),
  }));
