import { DEFAULT_MATCH_OUTBOX_DIRECTORY, DurableMatchRepository } from "./durable-match.repository.js";
import { InMemoryMatchRepository } from "./in-memory-match.repository.js";
import type { MatchRepository } from "./match.repository.js";
import { SupabaseMatchRepository } from "./supabase-match.repository.js";

export { InMemoryMatchRepository } from "./in-memory-match.repository.js";
export { SupabaseMatchRepository } from "./supabase-match.repository.js";
export { DurableMatchRepository } from "./durable-match.repository.js";
export * from "./match.repository.js";

export type ServerPersistenceEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
};

export const hasSupabaseConfiguration = (environment: ServerPersistenceEnvironment): boolean => Boolean(
  environment.SUPABASE_URL?.trim() && environment.SUPABASE_SECRET_KEY?.trim(),
);

export const createMatchRepository = (
  environment: ServerPersistenceEnvironment = process.env,
  outboxDirectory = DEFAULT_MATCH_OUTBOX_DIRECTORY,
): MatchRepository => {
  if (!hasSupabaseConfiguration(environment)) return new InMemoryMatchRepository();
  return new DurableMatchRepository(
    new SupabaseMatchRepository(environment.SUPABASE_URL!.trim(), environment.SUPABASE_SECRET_KEY!.trim()),
    outboxDirectory,
  );
};
