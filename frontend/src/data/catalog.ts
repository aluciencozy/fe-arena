import { anilistAnimeCandidates } from "../../../data/anilist-anime-candidates.catalog";
import type { AnimePlaylist, CatalogTitle } from "@/types";
import {
  getEasyModeRank,
  getTracksForPlaylist,
  hasExplicitEasyModeRanks,
} from "../../../shared/playlist";

export { getTracksForPlaylist };

type SourceTrack = (typeof anilistAnimeCandidates)[number]["tracks"][number];

export const catalogTitles: CatalogTitle[] = anilistAnimeCandidates.map(
  (candidate) => {
    const hasExplicitRanks = hasExplicitEasyModeRanks(candidate.tracks);
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

export const animeTitles = catalogTitles.filter(
  (title) => title.mode === "anime",
);
