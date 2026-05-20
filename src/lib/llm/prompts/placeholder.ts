export const version = 'placeholder-v0';

export const system = 'You are a helpful assistant. Reply with exactly {"ok": true}.';

export function userTemplate(_args: Record<string, never>): string {
  return 'Reply with exactly {"ok": true}.';
}
