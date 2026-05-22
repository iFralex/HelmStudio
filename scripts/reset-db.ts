import { rmSync, existsSync } from 'fs';
import { resolve } from 'path';

const dbPath = resolve(process.env.DATABASE_PATH ?? './data/pipeline.db');

for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
  if (existsSync(file)) {
    rmSync(file);
    console.log(`db:reset — deleted ${file}`);
  }
}

console.log(`db:reset — done. Run pnpm db:init to reinitialize.`);
