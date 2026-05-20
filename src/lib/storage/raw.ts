import fs from 'fs/promises';
import path from 'path';
import { absolutePath } from './paths';

export async function dumpRaw(relativePath: string, payload: unknown): Promise<string> {
  const absPath = absolutePath(relativePath);
  const tmpPath = `${absPath}.tmp`;

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  await fs.rename(tmpPath, absPath);

  return relativePath;
}

export async function loadRaw<T = unknown>(relativePath: string): Promise<T> {
  const absPath = absolutePath(relativePath);
  const content = await fs.readFile(absPath, 'utf8');
  return JSON.parse(content) as T;
}

export async function deleteRawForChannel(channelId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(channelId)) {
    throw new Error(`Invalid channelId: ${channelId}`);
  }
  const dirsToDelete = [
    path.join('raw', 'transcripts', channelId),
    path.join('raw', 'youtube', 'channels', channelId),
    path.join('raw', 'youtube', 'videos', channelId),
    path.join('raw', 'llm', 'qualifications', channelId),
    path.join('raw', 'llm', 'video_selections', channelId),
    path.join('raw', 'llm', 'drafts', channelId),
  ];

  await Promise.all(
    dirsToDelete.map((rel) =>
      fs.rm(absolutePath(rel), { recursive: true, force: true }),
    ),
  );
}
