import { cpus } from "node:os";

const BYTES_PER_MB = 1024 * 1024;

export function toMb(bytes: number): number {
  return Math.max(0, Math.round(bytes / BYTES_PER_MB));
}

export function parseCpuMillicores(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  if (trimmed.endsWith("n")) {
    return Math.round(Number.parseFloat(trimmed.slice(0, -1)) / 1_000_000);
  }

  if (trimmed.endsWith("u")) {
    return Math.round(Number.parseFloat(trimmed.slice(0, -1)) / 1_000);
  }

  if (trimmed.endsWith("m")) {
    return Math.round(Number.parseFloat(trimmed.slice(0, -1)));
  }

  return Math.round(Number.parseFloat(trimmed) * 1000);
}

export function parseMemoryBytes(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const match = trimmed.match(/^([0-9]*\.?[0-9]+)([a-zA-Z]+)?$/);
  if (!match) {
    return 0;
  }

  const amount = Number.parseFloat(match[1]);
  let unit = (match[2] ?? "B").toUpperCase();
  if (unit.endsWith("B") && unit !== "B") {
    unit = unit.slice(0, -1);
  }
  const unitTable: Record<string, number> = {
    B: 1,
    KI: 1024,
    MI: 1024 ** 2,
    GI: 1024 ** 3,
    TI: 1024 ** 4,
    K: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4
  };

  const multiplier = unitTable[unit] ?? 1;
  return Math.round(amount * multiplier);
}

export function parseDockerMemUsageBytes(value: string): number {
  const [usage] = value.split("/");
  return parseMemoryBytes((usage ?? "").trim());
}

export function parseDockerCpuMillicores(value: string): number {
  const trimmed = value.trim().replace("%", "");
  if (!trimmed) {
    return 0;
  }

  const cpuPercent = Number.parseFloat(trimmed);
  if (!Number.isFinite(cpuPercent) || cpuPercent <= 0) {
    return 0;
  }

  const hostCpuCount = Math.max(1, cpus().length);
  const usedCores = (cpuPercent / 100) * hostCpuCount;
  return Math.round(usedCores * 1000);
}

export function parseInteger(value: string): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function parseKilobytes(value: string): number {
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.round(parsed * 1024);
}
