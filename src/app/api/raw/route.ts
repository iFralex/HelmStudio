import { type NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { absolutePath, dataDir } from '@/lib/storage/paths';

export async function GET(req: NextRequest): Promise<Response> {
  const relativePath = req.nextUrl.searchParams.get('path');
  if (!relativePath) {
    return new NextResponse('Missing path parameter', { status: 400 });
  }

  let absPath: string;
  try {
    absPath = absolutePath(relativePath);
  } catch {
    return new NextResponse('Invalid path', { status: 400 });
  }

  // Restrict access to the raw/ subdirectory only
  const rawDir = path.resolve(dataDir(), 'raw');
  if (!absPath.startsWith(rawDir + path.sep)) {
    return new NextResponse('Access denied', { status: 403 });
  }

  try {
    await fs.promises.access(absPath, fs.constants.R_OK);
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  const filename = path.basename(absPath);
  const readStream = fs.createReadStream(absPath);
  const readable = new ReadableStream({
    start(controller) {
      readStream.on('data', (chunk) => controller.enqueue(chunk));
      readStream.on('end', () => controller.close());
      readStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      readStream.destroy();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
