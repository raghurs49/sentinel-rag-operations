import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the Sentinel product surfaces and truthful demo boundary", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /Sentinel/);
  assert.match(page, /Evaluation runs/);
  assert.match(page, /Failure explorer/);
  assert.match(page, /Release gate/);
  assert.match(page, /Drift & calibration/);
  assert.match(page, /buildReport/);
  assert.match(page, /Synthetic demo data/);
  assert.match(page, /No client or patient information/);
});

test("ships complete social metadata and preview artwork", async () => {
  const [layout, og] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("public/og.png", root)),
  ]);

  assert.match(layout, /summary_large_image/);
  assert.match(layout, /RAG Quality & Safety Operations/);
  assert.ok(og.byteLength > 100_000, "social preview should be a production asset");
});
