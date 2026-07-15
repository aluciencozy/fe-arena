import { EASY_MODE_TRACK_LIMIT } from "./game.constants.js";

export type AnimePlaylist = "standard" | "easy" | "op-ed";
export type AnimeTrackCategory = "ost" | "opening" | "ending";

type PlaylistTrackLike = {
  category: AnimeTrackCategory;
  easyModeRank?: number;
};

export const hasExplicitEasyModeRanks = (
  tracks: readonly PlaylistTrackLike[],
) => tracks.some((track) => "easyModeRank" in track);

export const getEasyModeRank = (
  track: PlaylistTrackLike,
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

export const getTracksForPlaylist = <T extends PlaylistTrackLike>(
  title: { tracks: readonly T[] },
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

export const getAnimePlaylistLabel = (playlist: AnimePlaylist) =>
  playlist === "op-ed" ? "OP & ED" : playlist;
