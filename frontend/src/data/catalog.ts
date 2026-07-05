import type { CatalogTitle } from "@/types";

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

export const animeTitles = catalogTitles.filter(
  (title) => title.mode === "anime",
);
