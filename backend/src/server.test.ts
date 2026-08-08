import assert from "node:assert/strict";
import test from "node:test";
import { startServer, type ServerRuntime } from "./server.js";
import type { RuntimeConfig } from "./config.js";
import { clearSoloForTests, soloSessionCountForTests } from "./services/solo.service.js";

const runtimeConfig = (isProduction: boolean): RuntimeConfig => ({
  nodeEnv: isProduction ? "production" : "test",
  isProduction,
  port: 0,
  frontendOrigins: [isProduction ? "https://arena.example" : "http://localhost:5173"],
  trustProxy: false,
  supabase: { configured: false, authConfigured: false },
});

const start = async (isProduction: boolean) => {
  const runtime = await startServer(runtimeConfig(isProduction));
  const address = runtime.httpServer.address();
  if (!address || typeof address === "string") throw new Error("test server did not start");
  return { runtime, base: `http://127.0.0.1:${address.port}` };
};

const socketUrl = (base: string, sid?: string) => {
  const url = new URL("/socket.io/", base);
  url.searchParams.set("EIO", "4");
  url.searchParams.set("transport", "polling");
  url.searchParams.set("t", `${Date.now()}-${Math.random()}`);
  if (sid) url.searchParams.set("sid", sid);
  return url;
};

const openPolling = async (base: string, origin: string) => {
  const response = await fetch(socketUrl(base), { headers: { Origin: origin } });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(body[0], "0");
  const handshake = JSON.parse(body.slice(1)) as { sid?: unknown };
  assert.equal(typeof handshake.sid, "string");
  return { sid: handshake.sid as string, origin };
};

const postPacket = async (base: string, session: { sid: string; origin: string }, packet: string) => {
  const response = await fetch(socketUrl(base, session.sid), {
    method: "POST",
    headers: { Origin: session.origin, "Content-Type": "text/plain; charset=UTF-8" },
    body: packet,
  });
  assert.equal(response.status, 200);
  await response.arrayBuffer();
};

const pollPacket = async (base: string, session: { sid: string; origin: string }) => {
  const response = await fetch(socketUrl(base, session.sid), {
    headers: { Origin: session.origin },
    signal: AbortSignal.timeout(2_000),
  });
  assert.equal(response.status, 200);
  return response.text();
};

const connectNamespace = async (base: string, session: { sid: string; origin: string }) => {
  await postPacket(base, session, `40${JSON.stringify({ accessToken: null })}`);
  assert.match(await pollPacket(base, session), /40/);
};

const closeRuntime = async (runtime: ServerRuntime) => {
  await runtime.close();
  assert.equal(runtime.httpServer.listening, false);
};

test("Socket.IO enforces the production origin allowlist and accepts guest connections", async () => {
  const { runtime, base } = await start(true);
  try {
    const denied = await fetch(socketUrl(base), { headers: { Origin: "https://evil.example" } });
    assert.equal(denied.status, 403);
    assert.match(await denied.text(), /Origin is not allowed/);

    const session = await openPolling(base, "https://arena.example");
    await connectNamespace(base, session);
  } finally {
    await closeRuntime(runtime);
  }
});

test("Socket.IO packet middleware enforces event-specific limits", async () => {
  const { runtime, base } = await start(false);
  try {
    const session = await openPolling(base, "http://localhost:5173");
    await connectNamespace(base, session);
    for (let index = 0; index < 11; index += 1) {
      await postPacket(base, session, `42${JSON.stringify(["chat:send", { message: "hello" }])}`);
    }
    assert.match(await pollPacket(base, session), /SOCKET_RATE_LIMIT/);
  } finally {
    await closeRuntime(runtime);
  }
});

test("disconnecting a Socket.IO guest clears its non-resumable solo session", async () => {
  clearSoloForTests();
  const { runtime, base } = await start(false);
  try {
    const session = await openPolling(base, "http://localhost:5173");
    await connectNamespace(base, session);
    await postPacket(
      base,
      session,
      `42${JSON.stringify(["solo:start", { topicIds: ["stacks"], count: 1, timerSeconds: 30, supportsCoding: true }])}`,
    );
    assert.equal(soloSessionCountForTests(), 1);
    await postPacket(base, session, "41");
    assert.equal(soloSessionCountForTests(), 0);
  } finally {
    clearSoloForTests();
    await closeRuntime(runtime);
  }
});

test("server runtime shutdown closes the HTTP and Socket.IO transports", async () => {
  const { runtime, base } = await start(false);
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  await closeRuntime(runtime);
  await runtime.close();
  await assert.rejects(fetch(`${base}/healthz`));
});
