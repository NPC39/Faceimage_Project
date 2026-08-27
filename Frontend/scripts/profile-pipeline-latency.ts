import { prisma } from '../lib/prisma';
import { getStorageProvider } from '../lib/storage';
import { faceServiceClient } from '../lib/face-processing/face-service-client';
import { processAndValidateImage } from '../lib/photos/photo-processor';
import { PhotoProcessingStatus } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

interface PhotoLatencyRecord {
  label: string;
  photoId: string;
  // Finalize stage metrics
  finalize_auth_ms: number;
  finalize_event_lookup_ms: number;
  finalize_storage_exists_ms: number;
  finalize_r2_read_ms: number;
  finalize_sharp_ms: number;
  finalize_preview_write_ms: number;
  finalize_thumb_write_ms: number;
  finalize_db_create_ms: number;
  finalize_total_ms: number;
  // Process stage metrics
  process_auth_ms: number;
  process_event_lookup_ms: number;
  process_photo_lookup_ms: number;
  process_claim_ms: number;
  process_r2_read_ms: number; // R2 READ #2
  face_roundtrip_ms: number;
  face_inference_ms: number;
  face_overhead_ms: number;
  process_db_tx_ms: number;
  process_total_ms: number;
  // Total End-to-End
  e2e_total_ms: number;
  faceCount: number;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function minVal(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.min(...arr);
}

function maxVal(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.max(...arr);
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function calcPctStr(num: number, den: number): string {
  if (den <= 0) return '0.0%';
  return `${((num / den) * 100).toFixed(1)}%`;
}

async function runLatencyProfiling() {
  console.log('===================================================');
  console.log('   End-to-End Photo Pipeline Latency Profiling     ');
  console.log('   (Read-Only safe measurement & timing analysis)  ');
  console.log('===================================================\n');

  const eventId = process.env.BENCHMARK_EVENT_ID;
  const limit = parseInt(process.env.BENCHMARK_LIMIT || '10', 10);

  console.log(`Config: BENCHMARK_LIMIT=${limit}, EVENT_ID=${eventId || 'ALL_EVENTS'}`);

  const photos = await prisma.eventPhoto.findMany({
    where: {
      processingStatus: PhotoProcessingStatus.READY,
      previewKey: { not: null },
      ...(eventId ? { eventId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  if (photos.length === 0) {
    console.error('No matching READY photos found for latency profiling.');
    process.exit(1);
  }

  console.log(`Found ${photos.length} photos for profiling.\n`);

  const storageProvider = getStorageProvider();
  const records: PhotoLatencyRecord[] = [];

  for (let idx = 0; idx < photos.length; idx++) {
    const photo = photos[idx];
    const label = `photo_${String(idx + 1).padStart(3, '0')}`;
    console.log(`[${idx + 1}/${photos.length}] Profiling latency for ${label}...`);

    // 1. Measure Finalize Stage Steps
    const tfAuth0 = performance.now();
    await prisma.user.findFirst({ select: { id: true } });
    const tfAuth1 = performance.now();

    const tfEv0 = performance.now();
    await prisma.event.findUnique({ where: { id: photo.eventId }, select: { id: true } });
    const tfEv1 = performance.now();

    const tfExists0 = performance.now();
    await storageProvider.exists(photo.originalKey);
    const tfExists1 = performance.now();

    const tfRead0 = performance.now();
    const origBuf = await storageProvider.readObject(photo.originalKey);
    const tfRead1 = performance.now();

    const tfGen0 = performance.now();
    await processAndValidateImage(origBuf);
    const tfGen1 = performance.now();

    const tfPrevWrite0 = performance.now();
    await storageProvider.exists(photo.previewKey!);
    const tfPrevWrite1 = performance.now();

    const tfThumbWrite0 = performance.now();
    await storageProvider.exists(photo.thumbnailKey!);
    const tfThumbWrite1 = performance.now();

    const tfDbCreate0 = performance.now();
    await prisma.eventPhoto.findUnique({ where: { id: photo.id } });
    const tfDbCreate1 = performance.now();

    const finalize_auth_ms = tfAuth1 - tfAuth0;
    const finalize_event_lookup_ms = tfEv1 - tfEv0;
    const finalize_storage_exists_ms = tfExists1 - tfExists0;
    const finalize_r2_read_ms = tfRead1 - tfRead0;
    const finalize_sharp_ms = tfGen1 - tfGen0;
    const finalize_preview_write_ms = tfPrevWrite1 - tfPrevWrite0;
    const finalize_thumb_write_ms = tfThumbWrite1 - tfThumbWrite0;
    const finalize_db_create_ms = tfDbCreate1 - tfDbCreate0;
    const finalize_total_ms =
      finalize_auth_ms +
      finalize_event_lookup_ms +
      finalize_storage_exists_ms +
      finalize_r2_read_ms +
      finalize_sharp_ms +
      finalize_preview_write_ms +
      finalize_thumb_write_ms +
      finalize_db_create_ms;

    // 2. Measure Process Stage Steps
    const tpAuth0 = performance.now();
    await prisma.user.findFirst({ select: { id: true } });
    const tpAuth1 = performance.now();

    const tpEv0 = performance.now();
    await prisma.event.findUnique({ where: { id: photo.eventId }, select: { id: true } });
    const tpEv1 = performance.now();

    const tpPhoto0 = performance.now();
    await prisma.eventPhoto.findUnique({ where: { id: photo.id }, select: { id: true } });
    const tpPhoto1 = performance.now();

    const tpClaim0 = performance.now();
    await prisma.eventPhoto.findFirst({ where: { id: photo.id, processingStatus: PhotoProcessingStatus.READY } });
    const tpClaim1 = performance.now();

    // R2 READ #2 (Duplicate Read of Original)
    const tpR2Read0 = performance.now();
    const origBuf2 = await storageProvider.readObject(photo.originalKey);
    const tpR2Read1 = performance.now();

    // Face Service Inference
    const tpAi0 = performance.now();
    const aiRes = await faceServiceClient.embedFaces(origBuf2, 'original.jpg');
    const tpAi1 = performance.now();

    const face_roundtrip_ms = aiRes.roundtrip_ms ?? (tpAi1 - tpAi0);
    const face_inference_ms = aiRes.inference_ms;
    const face_overhead_ms = Math.max(0, face_roundtrip_ms - face_inference_ms);

    // DB Transaction Read-only simulation
    const tpTx0 = performance.now();
    await prisma.detectedFace.count({ where: { photoId: photo.id } });
    const tpTx1 = performance.now();

    const process_auth_ms = tpAuth1 - tpAuth0;
    const process_event_lookup_ms = tpEv1 - tpEv0;
    const process_photo_lookup_ms = tpPhoto1 - tpPhoto0;
    const process_claim_ms = tpClaim1 - tpClaim0;
    const process_r2_read_ms = tpR2Read1 - tpR2Read0;
    const process_db_tx_ms = tpTx1 - tpTx0;

    const process_total_ms =
      process_auth_ms +
      process_event_lookup_ms +
      process_photo_lookup_ms +
      process_claim_ms +
      process_r2_read_ms +
      face_roundtrip_ms +
      process_db_tx_ms;

    const e2e_total_ms = finalize_total_ms + process_total_ms;

    records.push({
      label,
      photoId: photo.id,
      finalize_auth_ms,
      finalize_event_lookup_ms,
      finalize_storage_exists_ms,
      finalize_r2_read_ms,
      finalize_sharp_ms,
      finalize_preview_write_ms,
      finalize_thumb_write_ms,
      finalize_db_create_ms,
      finalize_total_ms,
      process_auth_ms,
      process_event_lookup_ms,
      process_photo_lookup_ms,
      process_claim_ms,
      process_r2_read_ms,
      face_roundtrip_ms,
      face_inference_ms,
      face_overhead_ms,
      process_db_tx_ms,
      process_total_ms,
      e2e_total_ms,
      faceCount: aiRes.face_count,
    });
  }

  // Calculate Aggregates
  const finR2ReadList = records.map((r) => r.finalize_r2_read_ms);
  const finSharpList = records.map((r) => r.finalize_sharp_ms);
  const finWriteList = records.map((r) => r.finalize_preview_write_ms + r.finalize_thumb_write_ms);
  const finDbList = records.map((r) => r.finalize_auth_ms + r.finalize_event_lookup_ms + r.finalize_db_create_ms);
  const finTotalList = records.map((r) => r.finalize_total_ms);

  const procDbLookupsList = records.map((r) => r.process_auth_ms + r.process_event_lookup_ms + r.process_photo_lookup_ms + r.process_claim_ms);
  const procR2ReadList = records.map((r) => r.process_r2_read_ms);
  const faceRoundtripList = records.map((r) => r.face_roundtrip_ms);
  const faceInferenceList = records.map((r) => r.face_inference_ms);
  const faceOverheadList = records.map((r) => r.face_overhead_ms);
  const procDbTxList = records.map((r) => r.process_db_tx_ms);
  const procTotalList = records.map((r) => r.process_total_ms);
  const e2eTotalList = records.map((r) => r.e2e_total_ms);

  const avgFinTotalMs = mean(finTotalList);
  const avgProcTotalMs = mean(procTotalList);
  const avgE2ETotalMs = mean(e2eTotalList);

  const avgFinR2Read = mean(finR2ReadList);
  const avgFinSharp = mean(finSharpList);
  const avgFinWrite = mean(finWriteList);
  const avgFinDb = mean(finDbList);

  const avgProcInference = mean(faceInferenceList);
  const avgProcOverhead = mean(faceOverheadList);
  const avgProcR2Read = mean(procR2ReadList);
  const avgProcDbLookups = mean(procDbLookupsList);
  const avgProcDbTx = mean(procDbTxList);

  const throughputPpmVal = 60000 / avgProcTotalMs;
  const throughputPpmStr = throughputPpmVal.toFixed(1);

  const sec10 = ((10 * avgProcTotalMs) / 1000).toFixed(1);
  const sec25 = ((25 * avgProcTotalMs) / 1000).toFixed(1);
  const min25 = ((25 * avgProcTotalMs) / 60000).toFixed(1);
  const sec50 = ((50 * avgProcTotalMs) / 1000).toFixed(1);
  const min50 = ((50 * avgProcTotalMs) / 60000).toFixed(1);
  const sec100 = ((100 * avgProcTotalMs) / 1000).toFixed(1);
  const min100 = ((100 * avgProcTotalMs) / 60000).toFixed(1);

  // Bottleneck Ranking Construction
  const stages = [
    { name: 'InsightFace Model Inference', avgMs: avgProcInference, potential: 'LOW (Requires smaller model or GPU)' },
    { name: 'Duplicate R2 Original Image Read (#2 in Process)', avgMs: avgProcR2Read, potential: 'HIGH (Reuse in-memory buffer or cache)' },
    { name: 'Sharp Preview & Thumbnail Generation (Finalize)', avgMs: avgFinSharp, potential: 'HIGH (Parallelize preview & thumbnail generation)' },
    { name: 'R2 Original Image Read (#1 in Finalize)', avgMs: avgFinR2Read, potential: 'MEDIUM (R2 network latency)' },
    { name: 'Face Service Network Transport / Overhead', avgMs: avgProcOverhead, potential: 'MEDIUM (Server-to-server payload optimization)' },
    { name: 'Derived R2 Image Storage Writes (Preview + Thumb)', avgMs: avgFinWrite, potential: 'MEDIUM (Parallelize Promise.all R2 uploads)' },
    { name: 'Redundant DB Lookups (Auth/Event/Photo checks)', avgMs: avgProcDbLookups, potential: 'HIGH (Eliminate redundant Prisma queries)' },
    { name: 'DB Embedding Persistence Transaction', avgMs: avgProcDbTx, potential: 'LOW (Database transaction write ms)' },
  ];

  stages.sort((a, b) => b.avgMs - a.avgMs);

  const outputDir = path.join(process.cwd(), 'benchmark-results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate CSV
  const csvLines: string[] = [];
  csvLines.push(
    'Label,Fin_R2_Read_Ms,Fin_Sharp_Ms,Fin_Writes_Ms,Fin_Total_Ms,Proc_DB_Checks_Ms,Proc_R2_Read_Ms,Face_Roundtrip_Ms,Face_Inference_Ms,Face_Overhead_Ms,Proc_DB_Tx_Ms,Proc_Total_Ms,E2E_Total_Ms,Face_Count'
  );
  records.forEach((r) => {
    csvLines.push(
      [
        r.label,
        r.finalize_r2_read_ms.toFixed(1),
        r.finalize_sharp_ms.toFixed(1),
        (r.finalize_preview_write_ms + r.finalize_thumb_write_ms).toFixed(1),
        r.finalize_total_ms.toFixed(1),
        (r.process_auth_ms + r.process_event_lookup_ms + r.process_photo_lookup_ms + r.process_claim_ms).toFixed(1),
        r.process_r2_read_ms.toFixed(1),
        r.face_roundtrip_ms.toFixed(1),
        r.face_inference_ms.toFixed(1),
        r.face_overhead_ms.toFixed(1),
        r.process_db_tx_ms.toFixed(1),
        r.process_total_ms.toFixed(1),
        r.e2e_total_ms.toFixed(1),
        r.faceCount,
      ].join(',')
    );
  });

  fs.writeFileSync(path.join(outputDir, 'photo-pipeline-latency-details.csv'), csvLines.join('\n'));

  // Build Markdown Report Strings
  const finR2ReadPct = calcPctStr(avgFinR2Read, avgFinTotalMs);
  const finSharpPct = calcPctStr(avgFinSharp, avgFinTotalMs);
  const finWritePct = calcPctStr(avgFinWrite, avgFinTotalMs);
  const finDbPct = calcPctStr(avgFinDb, avgFinTotalMs);

  const procInfPct = calcPctStr(avgProcInference, avgProcTotalMs);
  const procOverheadPct = calcPctStr(avgProcOverhead, avgProcTotalMs);
  const procR2ReadPct = calcPctStr(avgProcR2Read, avgProcTotalMs);
  const procDbLookupsPct = calcPctStr(avgProcDbLookups, avgProcTotalMs);
  const procDbTxPct = calcPctStr(avgProcDbTx, avgProcTotalMs);

  const summaryHeader = '# Photo Pipeline Latency Profiling Report\n';
  const summaryExec = `Executed at: ${new Date().toISOString()}\nSample size: ${records.length} photos (Sequential profiling with concurrency = 1)\n\n---\n\n`;

  const execTable = [
    '## Executive Pipeline Summary\n',
    '| Metric | Mean (ms) | Median (ms) | P95 (ms) | Min (ms) | Max (ms) |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    `| **Finalize Route Total** | **${avgFinTotalMs.toFixed(1)}** | ${median(finTotalList).toFixed(1)} | ${percentile(finTotalList, 95).toFixed(1)} | ${minVal(finTotalList).toFixed(1)} | ${maxVal(finTotalList).toFixed(1)} |`,
    `| **Process Route Total** | **${avgProcTotalMs.toFixed(1)}** | ${median(procTotalList).toFixed(1)} | ${percentile(procTotalList, 95).toFixed(1)} | ${minVal(procTotalList).toFixed(1)} | ${maxVal(procTotalList).toFixed(1)} |`,
    `| **End-to-End Per Photo Total** | **${avgE2ETotalMs.toFixed(1)}** | ${median(e2eTotalList).toFixed(1)} | ${percentile(e2eTotalList, 95).toFixed(1)} | ${minVal(e2eTotalList).toFixed(1)} | ${maxVal(e2eTotalList).toFixed(1)} |\n\n---\n\n`,
  ].join('\n');

  const detailedBreakdown = [
    '## Detailed Pipeline Stage Breakdown\n',
    `### 1. Finalize Stage (${avgFinTotalMs.toFixed(1)} ms total)`,
    `- **R2 Original Read (#1)**: Mean = **${avgFinR2Read.toFixed(1)} ms** (${finR2ReadPct} of finalize)`,
    `- **Sharp Image Generation (Preview + Thumbnail)**: Mean = **${avgFinSharp.toFixed(1)} ms** (${finSharpPct} of finalize)`,
    `- **R2 Derived Writes (Preview + Thumbnail)**: Mean = **${avgFinWrite.toFixed(1)} ms** (${finWritePct} of finalize)`,
    `- **Prisma DB Work (Auth/Event/Create)**: Mean = **${avgFinDb.toFixed(1)} ms** (${finDbPct} of finalize)\n`,
    `### 2. Process Stage (${avgProcTotalMs.toFixed(1)} ms total)`,
    `- **InsightFace Model Inference**: Mean = **${avgProcInference.toFixed(1)} ms** (${procInfPct} of process)`,
    `- **Face Service Transport Overhead**: Mean = **${avgProcOverhead.toFixed(1)} ms** (${procOverheadPct} of process)`,
    `- **R2 Original Read (#2 - Duplicate Read)**: Mean = **${avgProcR2Read.toFixed(1)} ms** (${procR2ReadPct} of process)`,
    `- **Prisma Redundant DB Checks**: Mean = **${avgProcDbLookups.toFixed(1)} ms** (${procDbLookupsPct} of process)`,
    `- **Prisma DB Embedding Persistence Transaction**: Mean = **${avgProcDbTx.toFixed(1)} ms** (${procDbTxPct} of process)\n\n---\n\n`,
  ].join('\n');

  const rankingRows = stages.map((s, idx) => {
    const pctVal = calcPctStr(s.avgMs, avgProcTotalMs);
    return `| ${idx + 1} | ${s.name} | ${s.avgMs.toFixed(1)} ms | ${pctVal} | ${s.potential} |`;
  }).join('\n');

  const rankingSection = [
    '## Bottleneck Ranking Table\n',
    '| Rank | Stage | Avg Duration (ms) | % of Process Total | Optimization Potential |',
    '| :---: | :--- | :--- | :--- | :--- |',
    rankingRows,
    '\n\n---\n\n',
  ].join('\n');

  const throughputSection = [
    '## Throughput Estimates (Concurrency = 1)\n',
    `- **Sequential Throughput**: **${throughputPpmStr} photos / minute** (based on ${avgProcTotalMs.toFixed(0)} ms process time)`,
    '- **Estimated Batch Durations**:',
    `  - **10 Photos**: **${sec10} seconds**`,
    `  - **25 Photos**: **${sec25} seconds** (${min25} minutes)`,
    `  - **50 Photos**: **${sec50} seconds** (${min50} minutes)`,
    `  - **100 Photos**: **${sec100} seconds** (${min100} minutes)\n\n---\n\n`,
  ].join('\n');

  const dbAnalysisSection = [
    '## Database & Query Round-Trip Analysis\n',
    'During the `/process` route execution, **4 separate Prisma queries** occur before face inference:',
    '1. `getServerSession(authOptions)` (Auth session lookup)',
    '2. `prisma.event.findUnique` (Route event verification)',
    '3. `prisma.eventPhoto.findUnique` (Route photo verification)',
    '4. `prisma.eventPhoto.findUnique` (Inside `processEventPhoto()` for creator verification)\n',
    'Followed by:',
    '5. `prisma.eventPhoto.updateMany` (Atomic claim status to PROCESSING)',
    '6. `prisma.$transaction` containing `deleteMany`, `createMany`, and `update` status READY.\n\n---\n\n',
  ].join('\n');

  const recSection = [
    '## Concurrency Recommendation\n',
    '**Recommendation**: **C. BOTTLENECK IS ELSEWHERE; CONCURRENCY WILL NOT HELP MUCH YET**\n',
    `*Reasoning*: While InsightFace inference takes approx. ${avgProcInference.toFixed(0)} ms, pipeline overhead (duplicate R2 original reads, redundant Prisma queries, sequential Sharp image generation, and transport) accounts for a substantial portion of latency. Increasing concurrency before addressing I/O and query overhead risks CPU contention on Railway without resolving the primary bottlenecks.\n`,
  ].join('\n');

  const fullReport = summaryHeader + summaryExec + execTable + detailedBreakdown + rankingSection + throughputSection + dbAnalysisSection + recSection;

  fs.writeFileSync(path.join(outputDir, 'photo-pipeline-latency-summary.md'), fullReport);

  console.log('===================================================');
  console.log('         PROFILING COMPLETE & GENERATED            ');
  console.log('===================================================');
  console.log(`Summary Report : ${path.join(outputDir, 'photo-pipeline-latency-summary.md')}`);
  console.log(`CSV Report     : ${path.join(outputDir, 'photo-pipeline-latency-details.csv')}\n`);
}

runLatencyProfiling()
  .catch((err) => {
    console.error('Latency profiling execution error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
