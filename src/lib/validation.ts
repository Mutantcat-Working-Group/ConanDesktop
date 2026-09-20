export type ProfileSections = {
  includes: string[];
  settings: Record<string, string>;
  options: Record<string, string>;
  toolRequires: Record<string, string>;
  buildEnv: Record<string, string>;
  runEnv: Record<string, string>;
  conf: Record<string, string>;
};

const SAFE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isValidProfileName(name: string): boolean {
  return SAFE_NAME_PATTERN.test(name) && name !== "." && name !== "..";
}

export function isValidRemoteName(name: string): boolean {
  return isValidProfileName(name);
}

export function isValidRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:" || url.protocol === "file:") &&
      (url.protocol === "file:" || url.hostname.length > 0) &&
      !url.username && !url.password && !url.search && !url.hash
    );
  } catch {
    return false;
  }
}

type SectionName = keyof ProfileSections;

const SECTION_MAP: Record<string, SectionName> = {
  settings: "settings",
  options: "options",
  tool_requires: "toolRequires",
  buildenv: "buildEnv",
  runenv: "runEnv",
  conf: "conf",
};

const EMPTY_SECTIONS = (): ProfileSections => ({
  includes: [],
  settings: {},
  options: {},
  toolRequires: {},
  buildEnv: {},
  runEnv: {},
  conf: {},
});

function addLine(
  sections: ProfileSections,
  section: SectionName,
  line: string,
): void {
  const equalsIndex = line.indexOf("=");
  if (equalsIndex <= 0) {
    return;
  }

  const key = line.slice(0, equalsIndex).trim();
  const value = line.slice(equalsIndex + 1).trim();

  if (!key || key.startsWith("#") || key.startsWith(";")) {
    return;
  }

  if (sections[section] && typeof sections[section] === "object") {
    (sections[section] as Record<string, string>)[key] = value;
  }
}

export function parseProfileSections(raw: string): ProfileSections {
  const sections = EMPTY_SECTIONS();
  let current: SectionName | null = null;

  for (const originalLine of raw.split(/\r?\n/)) {
    const line = originalLine.trim();

    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }

    const sectionMatch = line.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      current = SECTION_MAP[sectionMatch[1]] ?? null;
      continue;
    }

    const includeMatch = line.match(/^include\((.+)\)$/);
    if (includeMatch) {
      sections.includes.push(`include(${includeMatch[1].trim()})`);
      current = null;
      continue;
    }

    if (current) {
      addLine(sections, current, line);
    }
  }

  return sections;
}
