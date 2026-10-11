/** Small, dependency-free statistics helpers. All functions are pure and deterministic. */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
}

export function stdev(values: number[]): number {
  return Math.sqrt(variance(values));
}

/** Linear-interpolated percentile (p in 0–100), matching the common "inclusive" definition. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

export function median(values: number[]): number {
  return percentile(values, 50);
}

/** Two-sample Kolmogorov–Smirnov statistic: the largest gap between the two empirical CDFs. */
export function ksStatistic(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  const points = [...new Set([...sa, ...sb])].sort((x, y) => x - y);
  let i = 0;
  let j = 0;
  let max = 0;
  for (const point of points) {
    while (i < sa.length && sa[i] <= point) i += 1;
    while (j < sb.length && sb[j] <= point) j += 1;
    max = Math.max(max, Math.abs(i / sa.length - j / sb.length));
  }
  return max;
}

/** Critical KS value for the two-sample test at the given significance level (default 5%). */
export function ksCritical(n: number, m: number, alpha = 0.05): number {
  if (n === 0 || m === 0) return 1;
  const c = Math.sqrt(-0.5 * Math.log(alpha / 2));
  return c * Math.sqrt((n + m) / (n * m));
}

/** Standardised mean difference (Cohen's d), candidate minus reference, clamped to ±5. */
export function effectSize(candidate: number[], reference: number[]): number {
  const n1 = candidate.length;
  const n2 = reference.length;
  if (n1 < 2 || n2 < 2) return 0;
  const pooled = Math.sqrt(((n1 - 1) * variance(candidate) + (n2 - 1) * variance(reference)) / (n1 + n2 - 2));
  const diff = mean(candidate) - mean(reference);
  if (pooled === 0) return diff === 0 ? 0 : Math.sign(diff) * 5;
  return Math.max(-5, Math.min(5, diff / pooled));
}

/** Seeded PRNG (mulberry32) so simulated data is reproducible across machines and runs. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wilson 95% confidence interval for a proportion. Honest about small samples, unlike a plain ± margin. */
export function wilsonInterval(successes: number, total: number, z = 1.96): [number, number] {
  if (total === 0) return [0, 0];
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return [Math.max(0, (centre - margin) / denominator), Math.min(1, (centre + margin) / denominator)];
}
