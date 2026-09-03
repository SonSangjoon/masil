import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type ConfigurationMetric = {
  passRate: number;
  criticalPassRate: number;
  firstPassValidRate: number;
  meanTokensPerRun: number;
  meanWallTimeMs: number;
  tokensPerSuccessfulOutcome: number | null;
  meanTimeToVisibleSuccessMs: number | null;
};

type Benchmark = {
  configurations: Record<string, ConfigurationMetric>;
  categories: Record<string, Record<string, ConfigurationMetric>>;
};

type Manifest = {
  createdAt: string;
  evalSetHash: string;
  configuration: "no_webmcp" | "candidate";
};

type Attempt = {
  order: number;
  iteration: string;
  createdAt: string;
  configuration: "no_webmcp" | "candidate";
  decision: "control" | "accepted" | "rejected";
  evalSetHash: string;
  metric: ConfigurationMetric;
  categories: Record<string, number>;
};

export type OptimizationTrajectory = {
  schemaVersion: "1.0.0";
  generatedFrom: "immutable official iteration artifacts";
  xAxis: "official iterations, in order";
  yAxis: "verified task success rate";
  attempts: Attempt[];
};

const TERRACOTTA = "#b65f49";
const CHARCOAL = "#171513";
const MUTED = "#77736d";
const PALE = "#d7d2ca";
const PAPER = "#f7f4ed";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function escaped(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pointsPath(values: Array<{ x: number; y: number }>) {
  if (!values.length) return "";
  return values
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}

function bestObservedTrajectoryPath(
  attempts: Attempt[],
  xFor: (index: number) => number,
  yFor: (value: number) => number,
  valueFor: (attempt: Attempt) => number,
  direction: "higher" | "lower",
  endX: number,
) {
  let frontier: number | null = null;
  const commands: string[] = [];
  attempts.forEach((attempt, index) => {
    if (attempt.configuration === "candidate") {
      const value = valueFor(attempt);
      frontier =
        frontier === null
          ? value
          : direction === "higher"
            ? Math.max(frontier, value)
            : Math.min(frontier, value);
    }
    if (frontier === null) return;
    const x = xFor(index);
    const y = yFor(frontier);
    if (!commands.length) commands.push(`M${x.toFixed(1)},${y.toFixed(1)}`);
    else commands.push(`H${x.toFixed(1)} V${y.toFixed(1)}`);
  });
  if (!commands.length) return "";
  commands.push(`H${endX.toFixed(1)}`);
  return commands.join(" ");
}

function niceTicks(minimum: number, maximum: number, targetIntervals = 4) {
  const span = Math.max(maximum - minimum, Number.EPSILON);
  const roughStep = span / targetIntervals;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceNormalized =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 2.5
          ? 2.5
          : normalized <= 5
            ? 5
            : 10;
  const step = niceNormalized * magnitude;
  const start = Math.floor(minimum / step) * step;
  const end = Math.ceil(maximum / step) * step;
  const count = Math.round((end - start) / step);

  return Array.from({ length: count + 1 }, (_, index) =>
    Number((start + index * step).toPrecision(12)),
  );
}

function starPoints(cx: number, cy: number, outer = 10, inner = 4.5) {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (Math.PI * index) / 5;
    return `${(cx + Math.cos(angle) * radius).toFixed(1)},${(
      cy + Math.sin(angle) * radius
    ).toFixed(1)}`;
  }).join(" ");
}

function pointMark(
  attempt: Attempt,
  x: number,
  y: number,
  radius = 6,
) {
  if (attempt.configuration === "no_webmcp") {
    return `<rect x="${x - radius}" y="${y - radius}" width="${radius * 2}" height="${radius * 2}" fill="${PAPER}" stroke="${PALE}" stroke-width="1.4"/>`;
  }
  if (attempt.decision === "rejected") {
    return `<g stroke="${MUTED}" stroke-width="1.35"><line x1="${x - radius}" y1="${y - radius}" x2="${x + radius}" y2="${y + radius}"/><line x1="${x + radius}" y1="${y - radius}" x2="${x - radius}" y2="${y + radius}"/></g>`;
  }
  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${MUTED}"/>`;
}

function passesOptimizationGate(
  metric: ConfigurationMetric,
  control: ConfigurationMetric,
  previousAccepted?: ConfigurationMetric,
) {
  if (metric.passRate <= control.passRate) return false;
  if (!previousAccepted) return true;
  if (metric.passRate < previousAccepted.passRate) return false;

  const tokenImproved =
    metric.meanTokensPerRun < previousAccepted.meanTokensPerRun;
  const timeImproved =
    metric.meanWallTimeMs < previousAccepted.meanWallTimeMs;
  const tokenRegressedTooFar =
    metric.meanTokensPerRun > previousAccepted.meanTokensPerRun * 1.1;
  const timeRegressedTooFar =
    metric.meanWallTimeMs > previousAccepted.meanWallTimeMs * 1.1;

  return (
    (tokenImproved || timeImproved) &&
    !tokenRegressedTooFar &&
    !timeRegressedTooFar
  );
}

export function readOptimizationTrajectory(
  iterationsRoot: string,
): OptimizationTrajectory | null {
  const names = readdirSync(iterationsRoot)
    .filter((name) => /^iteration-\d{3}$/.test(name))
    .sort();
  if (!names.length) return null;

  const measurements = names.map<Omit<Attempt, "decision">>((name, index) => {
    const root = join(iterationsRoot, name);
    const manifest = readJson<Manifest>(join(root, "manifest.json"));
    const benchmark = readJson<Benchmark>(join(root, "benchmark.json"));
    const metric = benchmark.configurations[manifest.configuration];
    if (!metric) {
      throw new Error(`${name} has no metric for ${manifest.configuration}.`);
    }
    return {
      order: index + 1,
      iteration: name,
      createdAt: manifest.createdAt,
      configuration: manifest.configuration,
      evalSetHash: manifest.evalSetHash,
      metric,
      categories: Object.fromEntries(
        Object.entries(benchmark.categories).map(([category, metrics]) => {
          return [category, metrics[manifest.configuration].passRate];
        }),
      ),
    };
  });

  const control = measurements.find(
    ({ configuration }) => configuration === "no_webmcp",
  );
  if (!control) {
    throw new Error("Optimization trajectory requires a no-WebMCP control.");
  }

  let previousAccepted: ConfigurationMetric | undefined;
  const attempts = measurements.map<Attempt>((attempt) => {
    const withDecision = (
      decision: Attempt["decision"],
    ): Attempt => ({
      order: attempt.order,
      iteration: attempt.iteration,
      createdAt: attempt.createdAt,
      configuration: attempt.configuration,
      decision,
      evalSetHash: attempt.evalSetHash,
      metric: attempt.metric,
      categories: attempt.categories,
    });
    if (attempt.configuration === "no_webmcp") {
      return withDecision("control");
    }
    const accepted = passesOptimizationGate(
      attempt.metric,
      control.metric,
      previousAccepted,
    );
    if (accepted) previousAccepted = attempt.metric;
    return withDecision(accepted ? "accepted" : "rejected");
  });

  return {
    schemaVersion: "1.0.0",
    generatedFrom: "immutable official iteration artifacts",
    xAxis: "official iterations, in order",
    yAxis: "verified task success rate",
    attempts,
  };
}

export function renderOptimizationTrajectory(data: OptimizationTrajectory) {
  const width = 1600;
  const height = 1260;
  const attempts = data.attempts;
  const plotX = 150;
  const plotWidth = 1310;
  const plotHeight = 180;
  const plotTops = [290, 640, 990];
  const xFor = (index: number) =>
    attempts.length === 1
      ? plotX + plotWidth / 2
      : plotX + 18 + (index / (attempts.length - 1)) * (plotWidth - 36);
  const wallSeconds = (metric: ConfigurationMetric) =>
    metric.meanWallTimeMs / 1000;
  const firstTry = attempts.at(0)?.iteration.replace("iteration-", "#") ?? "—";
  const lastTry = attempts.at(-1)?.iteration.replace("iteration-", "#") ?? "—";
  const retainedBest = [...attempts]
    .reverse()
    .find(({ decision }) => decision === "accepted")
    ?.iteration.replace("iteration-", "#");
  const selectedAttempt = [...attempts]
    .reverse()
    .find(({ decision }) => decision === "accepted");
  const selectedIndex = selectedAttempt
    ? attempts.findIndex(
        ({ iteration }) => iteration === selectedAttempt.iteration,
      )
    : -1;
  const controlAttempt = attempts.find(
    ({ configuration }) => configuration === "no_webmcp",
  );
  const plotDefinitions = [
    {
      title: "Task success",
      unit: "%",
      direction: "higher" as const,
      value: (attempt: Attempt) => attempt.metric.passRate * 100,
      fixedMinimum: 0,
      fixedMaximum: 100,
      scale: "absolute" as const,
      tickFormat: (value: number) => `${Math.round(value)}`,
      valueFormat: (value: number) => `${value.toFixed(1)}%`,
    },
    {
      title: "Tokens per try",
      unit: "tokens",
      direction: "lower" as const,
      value: (attempt: Attempt) => attempt.metric.meanTokensPerRun,
      fixedMinimum: null,
      fixedMaximum: null,
      scale: "focused" as const,
      tickFormat: (value: number) => Math.round(value).toLocaleString("en-US"),
      valueFormat: (value: number) =>
        `${Math.round(value).toLocaleString("en-US")} tokens`,
    },
    {
      title: "Seconds per try",
      unit: "seconds",
      direction: "lower" as const,
      value: (attempt: Attempt) => wallSeconds(attempt.metric),
      fixedMinimum: null,
      fixedMaximum: null,
      scale: "focused" as const,
      tickFormat: (value: number) => value.toFixed(value < 10 ? 1 : 0),
      valueFormat: (value: number) => `${value.toFixed(1)} s`,
    },
  ];

  const svg: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">`,
    `<title id="title">MASIL WebMCP optimization trajectory</title>`,
    `<desc id="description">Three vertically aligned plots show task success, tokens per try, and seconds per try from the no-WebMCP first iteration through later WebMCP candidates.</desc>`,
    `<rect width="${width}" height="${height}" fill="${PAPER}"/>`,
    `<style>text{font-family:Pretendard,Inter,Arial,sans-serif;fill:${CHARCOAL};font-weight:350;text-rendering:geometricPrecision} .muted{fill:${MUTED};font-weight:350} .accent{fill:${TERRACOTTA}} .axis{stroke:${MUTED};stroke-width:.9} .grid{stroke:${PALE};stroke-width:.7}</style>`,
    `<text x="90" y="64" font-size="30" font-weight="450" letter-spacing=".05">MASIL WebMCP optimization trajectory</text>`,
    `<text x="92" y="116" font-size="15" class="muted">${attempts.length} official tries · ${escaped(firstTry)}–${escaped(lastTry)} retained · ${escaped(firstTry)} no-WebMCP control${retainedBest ? ` · ${escaped(retainedBest)} retained best candidate` : ""}</text>`,
    `<g transform="translate(92 178)"><line x1="0" y1="0" x2="34" y2="0" stroke="${TERRACOTTA}" stroke-width="1.7" opacity=".62"/><text x="47" y="5" font-size="13.5" font-weight="400">Best observed frontier</text><polygon points="${starPoints(226, 0, 6.5, 2.8)}" fill="${TERRACOTTA}" stroke="${PAPER}" stroke-width="1"/><text x="242" y="5" font-size="13.5" font-weight="400">Selected ${escaped(retainedBest ?? "—")}</text><line x1="366" y1="0" x2="400" y2="0" stroke="${MUTED}" stroke-width="1.6" stroke-dasharray="6 7"/><rect x="377.5" y="-5.5" width="11" height="11" fill="${PAPER}" stroke="${PALE}" stroke-width="1.3"/><text x="413" y="5" font-size="13.5" font-weight="400">No WebMCP · #001</text><g transform="translate(591 0)" stroke="${MUTED}" stroke-width="1.35"><line x1="-4.8" y1="-4.8" x2="4.8" y2="4.8"/><line x1="4.8" y1="-4.8" x2="-4.8" y2="4.8"/></g><text x="609" y="5" font-size="13.5" font-weight="400">Rejected</text></g>`,
  ];

  plotDefinitions.forEach((plot, plotIndex) => {
    const top = plotTops[plotIndex];
    const values = attempts.map(plot.value);
    const finiteValues = values.filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
    const rawMaximum = Math.max(...finiteValues, plotIndex === 1 ? 1000 : 1);
    const observedMinimum = Math.min(...finiteValues);
    const observedSpan = Math.max(rawMaximum - observedMinimum, 1);
    const ticks =
      plot.fixedMinimum !== null && plot.fixedMaximum !== null
        ? [0, 0.25, 0.5, 0.75, 1].map(
            (fraction) =>
              plot.fixedMinimum +
              fraction * (plot.fixedMaximum - plot.fixedMinimum),
          )
        : niceTicks(
            Math.max(0, observedMinimum - observedSpan * 0.05),
            rawMaximum + observedSpan * 0.05,
          );
    const minimum = ticks.at(0) ?? 0;
    const maximum = ticks.at(-1) ?? 1;
    const domain = Math.max(maximum - minimum, 1);
    const yFor = (value: number) =>
      top +
      plotHeight -
      ((Math.max(minimum, Math.min(maximum, value)) - minimum) / domain) *
        plotHeight;
    const nullY = top + 8;
    ticks.forEach((tick) => {
      const y = yFor(tick);
      svg.push(
        `<line class="grid" x1="${plotX}" y1="${y}" x2="${plotX + plotWidth}" y2="${y}"/>`,
        `<text x="${plotX - 18}" y="${y + 4.5}" text-anchor="end" font-size="12.5" class="muted">${plot.tickFormat(tick)}</text>`,
      );
    });
    svg.push(
      `<text x="${plotX}" y="${top - 60}" font-size="19" font-weight="450">${plot.title}</text>`,
      `<text x="${plotX}" y="${top - 25}" font-size="13" class="muted">${plot.scale === "focused" ? "Focused scale · " : ""}${plot.direction === "higher" ? "Higher is better" : "Lower is better"} · ${plot.unit}</text>`,
      `<line class="axis" x1="${plotX}" y1="${top}" x2="${plotX}" y2="${top + plotHeight}"/>`,
      `<line class="axis" x1="${plotX}" y1="${top + plotHeight}" x2="${plotX + plotWidth}" y2="${top + plotHeight}"/>`,
    );
    const controlValue = controlAttempt ? plot.value(controlAttempt) : null;
    const noWebPath =
      controlValue === null
        ? ""
        : pointsPath([
            { x: plotX, y: yFor(controlValue) },
            { x: plotX + plotWidth, y: yFor(controlValue) },
          ]);
    if (noWebPath) {
      svg.push(
        `<path d="${noWebPath}" fill="none" stroke="${MUTED}" stroke-width="1.6" stroke-dasharray="6 7" opacity=".78"/>`,
      );
    }
    const selectedValue = selectedAttempt ? plot.value(selectedAttempt) : null;
    const frontierPath = bestObservedTrajectoryPath(
      attempts,
      xFor,
      yFor,
      plot.value,
      plot.direction,
      plotX + plotWidth,
    );
    if (frontierPath) {
      svg.push(
        `<path data-series="best-observed-frontier" d="${frontierPath}" fill="none" stroke="${TERRACOTTA}" stroke-width="1.7" stroke-linejoin="round" opacity=".62"/>`,
      );
    }
    values.forEach((value, index) => {
      const y = value === null ? nullY : yFor(value);
      svg.push(pointMark(attempts[index], xFor(index), y, 5));
      if (value === null) {
        svg.push(
          `<text x="${xFor(index) + 11}" y="${y + 5}" font-size="12" class="muted">no successful outcome</text>`,
        );
      }
    });
    svg.push(
      ...(selectedAttempt && selectedValue !== null && selectedIndex >= 0
        ? (() => {
            return [
              `<polygon points="${starPoints(xFor(selectedIndex), yFor(selectedValue), 12, 5.2)}" fill="${TERRACOTTA}" stroke="${PAPER}" stroke-width="1.7"/>`,
              `<text x="${xFor(selectedIndex) + 21}" y="${yFor(selectedValue) - 13}" font-size="15" font-weight="500" class="accent">${plot.valueFormat(selectedValue)}</text>`,
            ];
          })()
        : []),
    );
  });

  svg.push(
    `<text x="805" y="${plotTops[2] + plotHeight + 58}" text-anchor="middle" font-size="14.5" class="muted">Tries, in order</text>`,
    "</svg>",
  );
  return svg.join("\n");
}

export function buildOptimizationTrajectory(iterationsRoot: string) {
  const data = readOptimizationTrajectory(iterationsRoot);
  if (!data) return null;
  return {
    json: `${JSON.stringify(data, null, 2)}\n`,
    svg: `${renderOptimizationTrajectory(data)}\n`,
  };
}

export function writeOptimizationTrajectory(
  iterationsRoot: string,
  outputRoot: string,
) {
  const bundle = buildOptimizationTrajectory(iterationsRoot);
  if (!bundle) return false;
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(join(outputRoot, "trajectory.json"), bundle.json);
  writeFileSync(join(outputRoot, "trajectory.svg"), bundle.svg);
  return true;
}
