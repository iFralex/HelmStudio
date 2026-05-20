import { google, youtube_v3 } from 'googleapis';
import { env } from '@/lib/env';

let _yt: youtube_v3.Youtube | null = null;

export function getYoutube(): youtube_v3.Youtube {
  if (_yt) return _yt;
  _yt = google.youtube({ version: 'v3', auth: env.YOUTUBE_API_KEY });
  return _yt;
}
