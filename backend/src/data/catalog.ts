import { anilistAnimeCandidates } from "../../../data/anilist-anime-candidates.catalog.js";
import type { AnswerOption, CatalogTitle } from "../types/index.js";

export const catalogTitles: CatalogTitle[] = anilistAnimeCandidates.map(
  (candidate) => ({
    id: candidate.id,
    mode: "anime",
    name: candidate.name,
    canonicalTitle: candidate.canonicalTitle,
    romajiName: candidate.romajiName,
    nativeName: candidate.nativeName,
    coverImageUrl: candidate.coverImageUrl,
    answerAliases: [...candidate.answerAliases],
    tracks: candidate.tracks.map((track) => ({
      id: track.id,
      videoId: track.videoId,
      title: track.title,
      durationSeconds: track.durationSeconds,
    })),
  }),
);

export const getCatalogTitlesForMode = (mode: CatalogTitle["mode"]) =>
  catalogTitles.filter((title) => title.mode === mode);

export const getPlayableTitlesForMode = (mode: CatalogTitle["mode"]) =>
  getCatalogTitlesForMode(mode).filter((title) => title.tracks.length > 0);

export const getTitlesForTitleIds = (
  mode: CatalogTitle["mode"],
  titleIds: string[],
) => {
  const selectedIds = new Set(titleIds);
  return getPlayableTitlesForMode(mode).filter((title) =>
    selectedIds.has(title.id),
  );
};

export const getAnswerOptionsForTitles = (
  titles: CatalogTitle[],
): AnswerOption[] =>
  titles.map((title) => ({
    id: title.id,
    canonicalTitle: title.canonicalTitle,
    searchTerms: [
      title.canonicalTitle,
      title.romajiName,
      title.nativeName,
      ...title.answerAliases.map((alias) => alias.value),
    ].filter((term): term is string => Boolean(term?.trim())),
  }));
