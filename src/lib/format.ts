export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function formatDate(value: string | null): string {
  if (!value) {
    return "从未";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function shortenPath(path: string, max = 64): string {
  if (path.length <= max) {
    return path;
  }

  const budget = Math.max(0, Math.floor(max));
  if (budget <= 3) return ".".repeat(budget);
  const left = Math.floor((budget - 3) / 2);
  return `${path.slice(0, left)}...${path.slice(-(budget - 3 - left))}`;
}

export function formatCommandLine(argumentsList: string[]): string {
  return argumentsList.join(" ");
}
