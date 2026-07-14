import { anilistAnimeCandidates } from "../../../data/anilist-anime-candidates.catalog";
import type { AnimePlaylist, CatalogTitle } from "@/types";
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
          category: track.category,
          ...(easyModeRank === undefined ? {} : { easyModeRank }),
        };
      }),
    };
  },
);

export const getTracksForPlaylist = (
  title: CatalogTitle,
  playlist: AnimePlaylist = "standard",
) => {
  const soundtrackTracks = title.tracks.filter(
    (track) => track.category === "ost",
  );

  if (playlist === "op-ed") {
    return title.tracks.filter(
      (track) => track.category === "opening" || track.category === "ending",
    );
  }

  return playlist === "easy"
    ? soundtrackTracks
        .filter(
          (track) =>
            typeof track.easyModeRank === "number" &&
            Number.isInteger(track.easyModeRank) &&
            track.easyModeRank >= 1 &&
            track.easyModeRank <= EASY_MODE_TRACK_LIMIT,
        )
        .sort((left, right) => left.easyModeRank! - right.easyModeRank!)
        .slice(0, EASY_MODE_TRACK_LIMIT)
    : soundtrackTracks;
};

export const animeTitles = catalogTitles.filter(
  (title) => title.mode === "anime",
);
