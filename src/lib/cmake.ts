export type CmakeCache = Record<string, string>;

export function parseCmakeCache(content: string): CmakeCache {
  const cache: CmakeCache = {};

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):[^=]+=(.*)$/);
    if (!match) {
      continue;
    }

    cache[match[1]] = match[2];
  }

  return cache;
}
