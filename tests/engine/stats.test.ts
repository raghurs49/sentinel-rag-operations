import assert from "node:assert/strict";
import test from "node:test";
import { createRng, effectSize, ksCritical, ksStatistic, mean, median, percentile, stdev } from "../../lib/eval/stats";

test("mean, median and percentile follow the standard definitions", () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.equal(mean([]), 0);
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(percentile([10, 20, 30, 40], 50), 25);
  assert.equal(percentile([10, 20, 30, 40, 50], 95), 48);
  assert.equal(percentile([5], 95), 5);
});

test("sample standard deviation uses n-1", () => {
  assert.ok(Math.abs(stdev([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.001);
});

test("KS statistic is 0 for identical samples and 1 for disjoint ones", () => {
  assert.equal(ksStatistic([1, 2, 3, 4], [1, 2, 3, 4]), 0);
  assert.equal(ksStatistic([1, 2, 3], [10, 11, 12]), 1);
  assert.ok(Math.abs(ksStatistic([1, 2, 3, 4], [3, 4, 5, 6]) - 0.5) < 1e-9);
});

test("KS critical value shrinks as samples grow", () => {
  assert.ok(ksCritical(100, 100) < ksCritical(20, 20));
  assert.ok(Math.abs(ksCritical(30, 30) - 0.3505) < 0.001);
});

test("effect size is signed, clamped, and zero for equal samples", () => {
  assert.equal(effectSize([1, 2, 3], [1, 2, 3]), 0);
  assert.ok(effectSize([10, 11, 12], [1, 2, 3]) > 3);
  assert.ok(effectSize([1, 2, 3], [10, 11, 12]) < -3);
  assert.equal(effectSize([5, 5, 5], [0, 0, 0]), 5);
});

test("seeded RNG is reproducible and stays inside [0, 1)", () => {
  const a = createRng(7);
  const b = createRng(7);
  const draws = Array.from({ length: 50 }, () => a());
  assert.deepEqual(draws, Array.from({ length: 50 }, () => b()));
  assert.ok(draws.every((value) => value >= 0 && value < 1));
  assert.notDeepEqual(draws, Array.from({ length: 50 }, createRng(8)));
});

test("Wilson interval is wider for small samples and contains the observed rate", async () => {
  const { wilsonInterval } = await import("../../lib/eval/stats");
  const [lowSmall, highSmall] = wilsonInterval(8, 10);
  const [lowLarge, highLarge] = wilsonInterval(80, 100);
  assert.ok(lowSmall < 0.8 && highSmall > 0.8);
  assert.ok(highSmall - lowSmall > highLarge - lowLarge);
  assert.ok(Math.abs(lowLarge - 0.7112) < 0.002 && Math.abs(highLarge - 0.8666) < 0.002);
  assert.deepEqual(wilsonInterval(0, 0), [0, 0]);
  const [lo, hi] = wilsonInterval(10, 10);
  assert.equal(hi, 1);
  assert.ok(lo > 0.7);
});
