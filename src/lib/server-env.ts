import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let localEnvCache: Record<string, string> | null = null;

function parseEnvValue(rawValue: string) {
  const value = rawValue.trim();
  const quote = value[0];

  if ((quote === `"` || quote === `'`) && value.endsWith(quote)) {
    return value.slice(1, -1);
  }

  return value;
}

function readLocalEnvFiles() {
  if (localEnvCache) return localEnvCache;

  const env: Record<string, string> = {};

  for (const fileName of [".env", ".env.local"]) {
    const filePath = join(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;

    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = parseEnvValue(trimmed.slice(separatorIndex + 1));

      if (key) env[key] = value;
    }
  }

  localEnvCache = env;
  return env;
}

export function readServerEnv(
  key: string,
  options: {
    isValid?: (value: string) => boolean;
  } = {},
) {
  const processValue = process.env[key]?.trim();

  if (processValue && (!options.isValid || options.isValid(processValue))) {
    return processValue;
  }

  const localValue = readLocalEnvFiles()[key]?.trim();

  if (localValue && (!options.isValid || options.isValid(localValue))) {
    return localValue;
  }

  return processValue || localValue;
}
