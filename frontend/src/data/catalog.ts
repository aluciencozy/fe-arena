import { anilistAnimeCandidates } from "../../../data/anilist-anime-candidates.catalog";
import type { CatalogTitle } from "@/types";

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

export const animeTitles = catalogTitles.filter(
  (title) => title.mode === "anime" && title.tracks.length > 0,
);
