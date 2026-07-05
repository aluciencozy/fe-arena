import type { CatalogTitle } from "../types/index.js";

export const catalogTitles: CatalogTitle[] = [
  {
    id: "attack-on-titan",
    mode: "anime",
    name: "Attack on Titan",
    coverImageUrl:
      "https://cdn.myanimelist.net/images/anime/10/47347l.jpg",
    tracks: [
      {
        id: "attack-on-titan-op-1",
        videoId: "B5UUcVGqBDE",
        answer: "attack on titan",
      },
    ],
  },
  {
    id: "naruto",
    mode: "anime",
    name: "Naruto",
    coverImageUrl:
      "https://cdn.myanimelist.net/images/anime/13/17405l.jpg",
    tracks: [
      {
        id: "naruto-main-theme",
        videoId: "j6eA1_K7fO0",
        answer: "naruto",
      },
    ],
  },
];

export const getCatalogTitlesForMode = (mode: CatalogTitle["mode"]) =>
  catalogTitles.filter((title) => title.mode === mode);

export const getTracksForMode = (mode: CatalogTitle["mode"]) =>
  getCatalogTitlesForMode(mode).flatMap((title) => title.tracks);

export const getTracksForTitleIds = (
  mode: CatalogTitle["mode"],
  titleIds: string[],
) => {
  const selectedIds = new Set(titleIds);
  return getCatalogTitlesForMode(mode)
    .filter((title) => selectedIds.has(title.id))
    .flatMap((title) => title.tracks);
};
