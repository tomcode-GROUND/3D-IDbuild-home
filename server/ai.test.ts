import { createServer } from "node:http";
import { test, expect } from "vitest";
import { createAiHandler } from "./ai";
import { blankReview } from "../src/lib/planAnalysis";

const fakeKey = "runtime-mock-key";
const proposal = {
  summary: "Confirm ceiling height",
  questions: ["Ceiling height?"],
  walls: [],
  rooms: [],
  openings: [],
  measurements: [],
};
const out = (type = "output_text", text = JSON.stringify(proposal)) =>
  Response.json({
    status: "completed",
    output: [{ type: "message", content: [{ type, text }] }],
  });
async function service(
  provider: typeof fetch,
  run: (url: string) => Promise<void>,
  timeout = 500,
) {
  const handler = createAiHandler(provider, timeout);
  const app = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    app.once("error", reject);
    app.listen(0, "127.0.0.1", () => {
      app.off("error", reject);
      resolve();
    });
  });
  const addr = app.address();
  if (!addr || typeof addr === "string")
    throw Error("Missing test server address");
  try {
    await run("http://127.0.0.1:" + addr.port);
  } finally {
    await new Promise<void>((resolve, reject) =>
      app.close((err) => (err ? reject(err) : resolve())),
    );
  }
}
const post = (
  url: string,
  route = "analyze",
  origin = url,
  signal?: AbortSignal,
) =>
  fetch(url + "/api/" + route, {
    method: "POST",
    signal,
    headers: {
      Origin: origin,
      Authorization: "Bearer " + fakeKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      image: "data:image/png;base64,YQ==",
      messages: [],
      review: blankReview,
    }),
  });

test("validates against OpenAI and returns typed analysis without exposing credentials", async () => {
  await service(
    async (endpoint, init) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer " + fakeKey,
      );
      if (String(endpoint).endsWith("/models/gpt-4.1-mini"))
        return Response.json({ id: "gpt-4.1-mini" });
      expect(endpoint).toBe("https://api.openai.com/v1/responses");
      expect(JSON.parse(String(init?.body)).store).toBe(false);
      return out();
    },
    async (url) => {
      expect(await (await post(url, "validate")).json()).toEqual({
        validated: true,
      });
      expect(await (await post(url)).json()).toEqual({
        model: "gpt-4.1-mini",
        proposal,
      });
      expect(
        (await post(url, "validate", "https://outside.example")).status,
      ).toBe(403);
    },
  );
});

test.each([
  [
    401,
    Response.json({ error: { message: fakeKey } }, { status: 401 }),
    "rejected",
  ],
  [
    402,
    Response.json({ error: { code: "insufficient_quota" } }, { status: 429 }),
    "billing",
  ],
  [429, Response.json({}, { status: 429 }), "rate limit"],
  [422, Response.json({}, { status: 403 }), "cannot access"],
  [422, Response.json({}, { status: 404 }), "cannot access"],
  [502, Response.json({}, { status: 500 }), "could not complete"],
  [502, Response.json({ status: "incomplete", output: [] }), "incomplete"],
  [502, out("output_text", "not JSON"), "invalid floor-plan"],
  [422, out("refusal"), "declined"],
  [502, out("output_text", "{}"), "invalid floor-plan"],
])(
  "handles provider errors with status %i",
  async (code, upstream, fragment) => {
    await service(
      async () => upstream,
      async (url) => {
        const response = await post(url);
        expect(response.status).toBe(code);
        const text = await response.text();
        expect(text).toContain(fragment);
        expect(text).not.toContain(fakeKey);
      },
    );
  },
);

test("times out provider requests", async () => {
  await service(
    async (_endpoint, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(Error("aborted")),
          { once: true },
        );
      }),
    async (url) => {
      expect((await post(url)).status).toBe(504);
    },
    60,
  );
});

test("aborts provider work when the browser cancels", async () => {
  let start!: () => void, finish!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const stopped = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await service(
    async (_endpoint, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            finish();
            reject(Error("aborted"));
          },
          { once: true },
        );
        start();
      }),
    async (url) => {
      const controller = new AbortController();
      const request = post(url, "analyze", url, controller.signal).catch(
        (e) => e,
      );
      await started;
      controller.abort();
      expect((await request).name).toBe("AbortError");
      await stopped;
    },
  );
});

test("does not return a credential that appears in parsed provider output", async () => {
  const echoed = JSON.stringify({ ...proposal, summary: fakeKey }).replace(
    "runtime",
    "\\u0072untime",
  );
  await service(
    async () => out("output_text", echoed),
    async (url) => {
      const response = await post(url);
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain(fakeKey);
    },
  );
});

test("redacts network errors rather than forwarding provider exception details", async () => {
  await service(
    async () => {
      throw Error("Network error with " + fakeKey);
    },
    async (url) => {
      const response = await post(url);
      expect(response.status).toBe(502);
      const text = await response.text();
      expect(text).toContain("Could not reach OpenAI");
      expect(text).not.toContain(fakeKey);
    },
  );
});
