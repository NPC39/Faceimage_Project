import { prisma } from '../lib/prisma';
import { getStorageProvider } from '../lib/storage';
import fs from 'fs';
import path from 'path';

async function exportDataset() {
  console.log('Exporting representative production photo dataset for det_size benchmark...');
  const eventId = process.env.BENCHMARK_EVENT_ID || 'cmt9tk0390001qc2msv1c6w2q';
  const limit = parseInt(process.env.BENCHMARK_LIMIT || '15', 10);

  const photos = await prisma.eventPhoto.findMany({
    where: {
      processingStatus: 'READY',
      eventId,
    },
    include: {
      _count: { select: { detectedFaces: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  if (photos.length === 0) {
    console.error('No READY photos found for export.');
    process.exit(1);
  }

  const outputDir = path.join(__dirname, '../../benchmark-input');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const storageProvider = getStorageProvider();
  const manifest: Array<{ label: string; file: string; baselineFaceCount: number }> = [];

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const label = `photo_${String(i + 1).padStart(3, '0')}`;
    const filename = `${label}.jpg`;
    const filepath = path.join(outputDir, filename);

    console.log(`[${i + 1}/${photos.length}] Fetching ${label}...`);
    const buf = await storageProvider.readObject(p.originalKey);

    if (buf && buf.length > 0) {
      fs.writeFileSync(filepath, buf);
      manifest.push({
        label,
        file: filename,
        baselineFaceCount: p._count.detectedFaces,
      });
    }
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`Successfully exported ${manifest.length} photos to ${outputDir}`);
  process.exit(0);
}

exportDataset().catch((err) => {
  console.error('Export error:', err);
  process.exit(1);
});
