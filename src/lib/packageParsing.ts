import type { PackageDetail, PackageRevision, PackageRow } from "./types";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};

export function parsePackageSearch(
  value: unknown,
  preferredRemote: string,
): PackageRow[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const root = value as JsonObject;
  const remotes = Object.keys(root);
  if (remotes.length === 0) {
    return [];
  }

  const selectedRemote =
    remotes.find((remote) => remote === preferredRemote) || remotes[0];
  const entries = root[selectedRemote];
  if (!entries || typeof entries !== "object") {
    return [];
  }
  if (typeof (entries as JsonObject).error === "string") {
    throw new Error(String((entries as JsonObject).error));
  }

  return Object.keys(entries as JsonObject)
    .filter((reference) => reference.includes("/"))
    .map((reference) => {
      const [name, version] = reference.split("@")[0].split("/");
      return {
        reference,
        name: name || reference,
        version: version || "latest",
        remote: selectedRemote,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name) || right.version.localeCompare(left.version, undefined, { numeric: true }));
}

export function parsePackageDetails(value: unknown): PackageDetail | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const root = value as JsonObject;
  const [remote] = Object.keys(root);
  if (!remote) {
    return null;
  }

  const entries = root[remote];
  if (!entries || typeof entries !== "object") {
    return null;
  }

  if (typeof object(entries).error === "string") throw new Error(String(object(entries).error));
  const [reference] = Object.keys(entries as JsonObject).filter((key) => key.includes("/"));
  if (!reference) {
    return null;
  }

  const referenceObject = (entries as JsonObject)[reference] as
    | JsonObject
    | undefined;
  const revisionsObject = referenceObject?.revisions as JsonObject | undefined;
  if (!revisionsObject) {
    return { reference, remote, revisions: [] };
  }

  const revisions: PackageRevision[] = Object.entries(object(revisionsObject)).filter(([, value]) => value && typeof value === "object").map(
    ([id, revisionValue]) => {
      const revision = object(revisionValue);
      const packages = object(revision.packages);
      return {
        id,
        timestamp: numberToDate(revision.timestamp),
        packageCount: packages ? Object.keys(packages).length : 0,
      };
    },
  );

  return { reference, remote, revisions };
}

export function extractPackageInfos(value: unknown): PackageInfo[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const detail = parsePackageDetails(value);
  if (!detail) {
    return [];
  }

  const root = value as JsonObject;
  const entries = root[detail.remote] as JsonObject;
  const referenceObject = object(entries[detail.reference]);
  const revisionsObject = referenceObject.revisions as JsonObject;
  const infos: PackageInfo[] = [];
  if (!revisionsObject || typeof revisionsObject !== "object") return infos;

  for (const [revisionId, revisionValue] of Object.entries(revisionsObject)) {
    const packages = object(object(revisionValue).packages);
    if (!packages) {
      continue;
    }

    for (const [packageId, packageValue] of Object.entries(packages)) {
      const info = object(packageValue).info as JsonObject | undefined;
      if (!info) {
        continue;
      }

      infos.push({
        revisionId,
        packageId,
        settings: objectToEntries(info.settings),
        options: objectToEntries(info.options),
      });
    }
  }

  return infos;
}

export interface PackageInfo {
  revisionId: string;
  packageId: string;
  settings: KeyValue[];
  options: KeyValue[];
}

export interface KeyValue {
  key: string;
  value: string;
}

function objectToEntries(value: unknown): KeyValue[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as JsonObject).map(([key, entryValue]) => ({
    key,
    value: typeof entryValue === "string" ? entryValue : JSON.stringify(entryValue),
  }));
}

function numberToDate(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value * 1000) > 8.64e15) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}
