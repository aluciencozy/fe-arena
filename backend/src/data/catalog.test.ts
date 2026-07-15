import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogTitles,
  getPlayableTitlesForMode,
  getTracksForPlaylist,
} from "./catalog.js";

test("standard and easy playlists contain only soundtrack tracks", () => {
  for (const playlist of ["standard", "easy"] as const) {
    const tracks = getPlayableTitlesForMode("anime", playlist).flatMap((title) =>
      getTracksForPlaylist(title, playlist),
    );

    assert.ok(tracks.length > 0);
    assert.ok(tracks.every((track) => track.category === "ost"));
  }
});

test("OP & ED contains openings and endings but no soundtrack tracks", () => {
  const tracks = getPlayableTitlesForMode("anime", "op-ed").flatMap((title) =>
    getTracksForPlaylist(title, "op-ed"),
  );

  assert.ok(tracks.some((track) => track.category === "opening"));
  assert.ok(tracks.some((track) => track.category === "ending"));
  assert.ok(tracks.every((track) => track.category !== "ost"));
});

test("only titles with tracks in the selected playlist are playable", () => {
  const playableIds = new Set(
    getPlayableTitlesForMode("anime", "op-ed").map((title) => title.id),
  );

  assert.deepEqual(
    [...playableIds].sort(),
    [
      "anilist-1535-death-note",
      "anilist-16498-shingeki-no-kyojin",
    ].sort(),
  );
  assert.ok(catalogTitles.some((title) => !playableIds.has(title.id)));
});
