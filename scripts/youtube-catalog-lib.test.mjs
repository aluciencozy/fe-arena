import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCatalogFromPlaylists,
  classifyVideo,
  validateMapping,
} from "./youtube-catalog-lib.mjs";

const sourceCandidates = [
  {
    id: "anilist-1-one",
    anilistId: 1,
    mode: "anime",
    name: "One",
    canonicalTitle: "One",
    romajiName: "Ichi",
    nativeName: "一",
    coverImageUrl: "cover-1",
    answerAliases: [{ value: "one", match: "exact" }],
    tracks: [],
  },
  {
    id: "anilist-2-two",
    anilistId: 2,
    mode: "anime",
    name: "Two",
    canonicalTitle: "Two",
    coverImageUrl: "cover-2",
    answerAliases: [],
    tracks: [],
  },
];

const checklist = {
  approved: true,
  groups: [
    {
      canonicalAnimeId: "anilist-1-one",
      primary: sourceCandidates[0],
      members: [sourceCandidates[0], { name: "One Season 2", answerAliases: [] }],
    },
    {
      canonicalAnimeId: "anilist-2-two",
      primary: sourceCandidates[1],
      members: [sourceCandidates[1]],
    },
  ],
};

test("classifies obvious noise and reports ambiguous titles", () => {
  assert.deepEqual(classifyVideo({ title: "Anime OST mix - 2 hours" }), {
    kind: "skip",
    reason: "mix-or-compilation",
  });
  assert.deepEqual(classifyVideo({ title: "Opening piano cover" }), {
    kind: "ambiguous",
    flags: ["cover", "piano"],
  });
  assert.deepEqual(classifyVideo({ title: "Main Theme" }), { kind: "retain" });
});

test("requires coverage for every approved canonical anime", () => {
  assert.deepEqual(
    validateMapping(
      {
        version: 1,
        entries: [
          {
            canonicalAnimeId: "anilist-1-one",
            playlistUrl: "https://www.youtube.com/playlist?list=ONE",
            category: "ost",
          },
        ],
      },
      ["anilist-1-one", "anilist-2-two"],
    ),
    ["Canonical anime anilist-2-two has no playlist mapping."],
  );
});

test("ranks merged tracks by views, then playlist order, and preserves easy ranks", async () => {
  const payloads = new Map([
    [
      "https://www.youtube.com/playlist?list=ONE",
      {
        entries: [
          { id: "aaaaaaaaaaa", title: "Ten views", duration: 61, view_count: 10 },
          { id: "bbbbbbbbbbb", title: "No views", duration: 62, view_count: null },
          { id: "ccccccccccc", title: "Twenty views", duration: 63, view_count: 20 },
          { id: "ccccccccccc", title: "Duplicate", duration: 63, view_count: 20 },
        ],
      },
    ],
    [
      "https://www.youtube.com/playlist?list=TWO",
      {
        entries: [
          { id: "ddddddddddd", title: "Twenty views, later", duration: 64, view_count: 20 },
        ],
      },
    ],
  ]);
  const result = await buildCatalogFromPlaylists({
    sourceCandidates,
    checklist,
    mapping: {
      version: 1,
      entries: [
        {
          canonicalAnimeId: "anilist-1-one",
          playlistUrl: "https://www.youtube.com/playlist?list=ONE",
          category: "ost",
        },
        {
          canonicalAnimeId: "anilist-1-one",
          playlistUrl: "https://www.youtube.com/playlist?list=TWO",
          category: "opening",
        },
      ],
    },
    extract: async (url) => payloads.get(url),
  });

  assert.equal(result.catalog, null);
  assert.ok(result.report.errors.some((error) => error.includes("anilist-2-two")));

  const successful = await buildCatalogFromPlaylists({
    sourceCandidates,
    checklist: {
      ...checklist,
      groups: [checklist.groups[0]],
    },
    mapping: {
      version: 1,
      entries: [
        {
          canonicalAnimeId: "anilist-1-one",
          playlistUrl: "https://www.youtube.com/playlist?list=ONE",
          category: "ost",
        },
        {
          canonicalAnimeId: "anilist-1-one",
          playlistUrl: "https://www.youtube.com/playlist?list=TWO",
          category: "opening",
        },
      ],
    },
    extract: async (url) => payloads.get(url),
  });

  assert.ok(successful.catalog);
  assert.deepEqual(
    successful.catalog[0].tracks.map((track) => [track.videoId, track.easyModeRank]),
    [
      ["ccccccccccc", 1],
      ["ddddddddddd", 2],
      ["aaaaaaaaaaa", 3],
      ["bbbbbbbbbbb", 4],
    ],
  );
  assert.equal(successful.report.duplicateVideos.length, 1);
  assert.equal(successful.catalog[0].tracks[0].viewCount, 20);
  assert.ok(successful.catalog[0].answerAliases.some((alias) => alias.value === "One Season 2"));
});

test("rejects a video shared by different anime", async () => {
  const result = await buildCatalogFromPlaylists({
    sourceCandidates,
    checklist,
    mapping: {
      version: 1,
      entries: [
        {
          canonicalAnimeId: "anilist-1-one",
          playlistUrl: "https://www.youtube.com/playlist?list=ONE",
          category: "ost",
        },
        {
          canonicalAnimeId: "anilist-2-two",
          playlistUrl: "https://www.youtube.com/playlist?list=TWO",
          category: "ost",
        },
      ],
    },
    extract: async () => ({ entries: [{ id: "aaaaaaaaaaa", title: "Shared", view_count: 1 }] }),
  });

  assert.equal(result.catalog, null);
  assert.ok(result.report.errors.some((error) => error.includes("mapped to both")));
});
