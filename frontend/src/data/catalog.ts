import { anilistAnimeCandidates } from "../../../data/anilist-anime-candidates.catalog";
import type { CatalogTitle, GameDifficulty } from "@/types";
import { EASY_MODE_TRACK_LIMIT } from "../../../shared/game.constants";

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

export const animeTitles = catalogTitles.filter(
  (title) => title.mode === "anime" && getTracksForDifficulty(title).length > 0,
);
