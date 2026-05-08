import { ingestRawParquetFiles } from "../dataIngest";
import type { Manifest, MatchPayload, UploadedDataset } from "../types";

export async function parseUploadedDataset(files: File[]): Promise<UploadedDataset> {
  const manifestFile = files.find((file) => file.name === "manifest.json" || file.webkitRelativePath.endsWith("manifest.json"));
  if (!manifestFile) {
    return ingestRawParquetFiles(files);
  }
  if (!manifestFile) {
    throw new Error("Upload the processed data folder that contains manifest.json and matches/*.json.");
  }

  const manifest = JSON.parse(await manifestFile.text()) as Manifest;
  if (!Array.isArray(manifest.matches) || !Array.isArray(manifest.maps)) {
    throw new Error("manifest.json does not look like a LILA processed dataset.");
  }

  const matchFiles = files.filter((file) => {
    const path = file.webkitRelativePath || file.name;
    return path.includes("/matches/") && path.endsWith(".json");
  });
  if (!matchFiles.length) {
    throw new Error("No match JSON files found. Upload the folder that includes matches/*.json.");
  }

  const matches = new Map<string, MatchPayload>();
  await Promise.all(matchFiles.map(async (file) => {
    const payload = JSON.parse(await file.text()) as MatchPayload;
    if (payload.key) matches.set(payload.key, payload);
  }));

  const missing = manifest.matches.filter((summary) => !matches.has(summary.key)).slice(0, 3);
  if (missing.length) {
    throw new Error(`Uploaded dataset is incomplete. Missing match JSON for ${missing.map((item) => item.key).join(", ")}.`);
  }

  return { manifest, matches };
}