import { prisma } from '../lib/prisma';
import { getStorageProvider } from '../lib/storage';
import { faceServiceClient } from '../lib/face-processing/face-service-client';
import { cosineSimilarity } from '../lib/face-search/cosine-similarity';
import { PhotoProcessingStatus } from '@prisma/client';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

interface PhotoResultMetric {
  label: string;
  photoId: string;
  origWidth: number;
  origHeight: number;
  origBytes: number;
  origApiMs: number;
  origTotalMs: number;
  origFacesCount: number;
  prevWidth: number;
  prevHeight: number;
  prevBytes: number;
  prevApiMs: number;
  prevTotalMs: number;
  prevFacesCount: number;
  byteReductionPct: number;
  apiSpeedupPct: number;
  totalSpeedupPct: number;
  faceDelta: number;
  matchedFacesCount: number;
  meanSimilarity: number;
  minSimilarity: number;
  unmatchedOrigCount: number;
  unmatchedPrevCount: number;
  category: 'No Faces' | 'Solo Portrait' | 'Small Group (2-4)' | 'Large Group (5+)';
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

function matchFaceEmbeddings(origEmbeddings: number[][], prevEmbeddings: number[][]) {
  const origCount = origEmbeddings.length;
  const prevCount = prevEmbeddings.length;

  if (origCount === 0 || prevCount === 0) {
    return {
      matchedCount: 0,
      similarities: [],
      unmatchedOrigCount: origCount,
      unmatchedPrevCount: prevCount,
    };
  }

  const pairs: { i: number; j: number; sim: number }[] = [];
  for (let i = 0; i < origCount; i++) {
    for (let j = 0; j < prevCount; j++) {
      const sim = cosineSimilarity(origEmbeddings[i], prevEmbeddings[j]);
      pairs.push({ i, j, sim });
    }
  }

  pairs.sort((a, b) => b.sim - a.sim);

  const matchedOrig = new Set<number>();
  const matchedPrev = new Set<number>();
  const similarities: number[] = [];

  for (const pair of pairs) {
    if (!matchedOrig.has(pair.i) && !matchedPrev.has(pair.j)) {
      matchedOrig.add(pair.i);
      matchedPrev.add(pair.j);
      similarities.push(pair.sim);
    }
  }

  return {
    matchedCount: similarities.length,
    similarities,
    unmatchedOrigCount: origCount - similarities.length,
    unmatchedPrevCount: prevCount - similarities.length,
  };
}

async function runBenchmark() {
  console.log('===================================================');
  console.log('   Face Input Performance & Accuracy Benchmark     ');
  console.log('   (Read-Only: Original vs 1800px Preview)         ');
  console.log('===================================================\n');

  const eventId = process.env.BENCHMARK_EVENT_ID;
  const limit = parseInt(process.env.BENCHMARK_LIMIT || '10', 10);
  const warmupCount = parseInt(process.env.BENCHMARK_WARMUP_COUNT || '1', 10);

  console.log(`Config: BENCHMARK_LIMIT=${limit}, WARMUP=${warmupCount}, EVENT_ID=${eventId || 'ALL_EVENTS'}`);

  // Query READY photos with previewKey
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
    console.error('No matching READY photos found with previewKey in the database.');
    process.exit(1);
  }

  console.log(`Found ${photos.length} photos for benchmarking.\n`);

  const storageProvider = getStorageProvider();

  // Perform Warmup if requested
  if (warmupCount > 0 && photos.length > 0) {
    console.log(`Executing ${warmupCount} warm-up request(s) to prime FastAPI service...`);
    try {
      const warmupBuf = await storageProvider.readObject(photos[0].originalKey);
      for (let w = 0; w < warmupCount; w++) {
        await faceServiceClient.embedFaces(warmupBuf, 'warmup.jpg');
      }
      console.log('Warmup complete.\n');
    } catch (err) {
      console.warn('Warmup failed, continuing with measured runs:', err);
    }
  }

  const results: PhotoResultMetric[] = [];
  const allMatchedSimilarities: number[] = [];

  for (let idx = 0; idx < photos.length; idx++) {
    const photo = photos[idx];
    const label = `photo_${String(idx + 1).padStart(3, '0')}`;
    console.log(`[${idx + 1}/${photos.length}] Benchmarking ${label}...`);

    let origBuf: Buffer;
    let prevBuf: Buffer;

    try {
      origBuf = await storageProvider.readObject(photo.originalKey);
      prevBuf = await storageProvider.readObject(photo.previewKey!);
    } catch (err) {
      console.error(`Failed to read storage objects for ${label}:`, err);
      continue;
    }

    const origMeta = await sharp(origBuf).metadata();
    const prevMeta = await sharp(prevBuf).metadata();

    const origWidth = origMeta.width || 0;
    const origHeight = origMeta.height || 0;
    const origBytes = origBuf.length;

    const prevWidth = prevMeta.width || 0;
    const prevHeight = prevMeta.height || 0;
    const prevBytes = prevBuf.length;

    // 1. Run Original inference
    const t0Orig = performance.now();
    const origRes = await faceServiceClient.embedFaces(origBuf, 'original.jpg');
    const t1Orig = performance.now();
    const origTotalMs = t1Orig - t0Orig;
    const origApiMs = origRes.inference_ms;
    const origFaces = origRes.faces || [];
    const origFacesCount = origRes.face_count;

    // 2. Run Preview inference (Sequential)
    const t0Prev = performance.now();
    const prevRes = await faceServiceClient.embedFaces(prevBuf, 'preview.webp');
    const t1Prev = performance.now();
    const prevTotalMs = t1Prev - t0Prev;
    const prevApiMs = prevRes.inference_ms;
    const prevFaces = prevRes.faces || [];
    const prevFacesCount = prevRes.face_count;

    // Calculations
    const byteReductionPct = ((origBytes - prevBytes) / origBytes) * 100;
    const apiSpeedupPct = origApiMs > 0 ? ((origApiMs - prevApiMs) / origApiMs) * 100 : 0;
    const totalSpeedupPct = origTotalMs > 0 ? ((origTotalMs - prevTotalMs) / origTotalMs) * 100 : 0;
    const faceDelta = prevFacesCount - origFacesCount;

    // Embeddings matching
    const origEmbeddings = origFaces.map((f) => f.embedding);
    const prevEmbeddings = prevFaces.map((f) => f.embedding);
    const matchResult = matchFaceEmbeddings(origEmbeddings, prevEmbeddings);

    allMatchedSimilarities.push(...matchResult.similarities);

    let category: PhotoResultMetric['category'] = 'No Faces';
    if (origFacesCount === 1) category = 'Solo Portrait';
    else if (origFacesCount >= 2 && origFacesCount <= 4) category = 'Small Group (2-4)';
    else if (origFacesCount >= 5) category = 'Large Group (5+)';

    const meanSim = matchResult.similarities.length > 0 ? mean(matchResult.similarities) : 1.0;
    const minSim = matchResult.similarities.length > 0 ? minVal(matchResult.similarities) : 1.0;

    results.push({
      label,
      photoId: photo.id,
      origWidth,
      origHeight,
      origBytes,
      origApiMs,
      origTotalMs,
      origFacesCount,
      prevWidth,
      prevHeight,
      prevBytes,
      prevApiMs,
      prevTotalMs,
      prevFacesCount,
      byteReductionPct,
      apiSpeedupPct,
      totalSpeedupPct,
      faceDelta,
      matchedFacesCount: matchResult.matchedCount,
      meanSimilarity: meanSim,
      minSimilarity: minSim,
      unmatchedOrigCount: matchResult.unmatchedOrigCount,
      unmatchedPrevCount: matchResult.unmatchedPrevCount,
      category,
    });
  }

  if (results.length === 0) {
    console.error('No benchmark results produced.');
    process.exit(1);
  }

  // Aggregate Calculations
  const origBytesList = results.map((r) => r.origBytes);
  const prevBytesList = results.map((r) => r.prevBytes);
  const origApiMsList = results.map((r) => r.origApiMs);
  const prevApiMsList = results.map((r) => r.prevApiMs);
  const origTotalMsList = results.map((r) => r.origTotalMs);
  const prevTotalMsList = results.map((r) => r.prevTotalMs);

  const byteReductionList = results.map((r) => r.byteReductionPct);
  const apiSpeedupList = results.map((r) => r.apiSpeedupPct);
  const totalSpeedupList = results.map((r) => r.totalSpeedupPct);

  const totalOrigFaces = results.reduce((sum, r) => sum + r.origFacesCount, 0);
  const totalPrevFaces = results.reduce((sum, r) => sum + r.prevFacesCount, 0);
  const faceRetentionRatePct = totalOrigFaces > 0 ? (totalPrevFaces / totalOrigFaces) * 100 : 100;

  const identicalFaceCount = results.filter((r) => r.origFacesCount === r.prevFacesCount).length;
  const fewerFacesCount = results.filter((r) => r.prevFacesCount < r.origFacesCount).length;
  const moreFacesCount = results.filter((r) => r.prevFacesCount > r.origFacesCount).length;

  const globalMeanSim = allMatchedSimilarities.length > 0 ? mean(allMatchedSimilarities) : 1.0;
  const globalMinSim = allMatchedSimilarities.length > 0 ? minVal(allMatchedSimilarities) : 1.0;

  // Production Assessment Classification
  let assessment: 'A. STRONG CANDIDATE' | 'B. NEEDS MORE TESTING' | 'C. NOT RECOMMENDED';
  let assessmentReason = '';

  const avgApiSpeedup = mean(apiSpeedupList);
  const faceAccuracyIdenticalPct = (identicalFaceCount / results.length) * 100;

  if (avgApiSpeedup >= 25 && faceRetentionRatePct >= 95 && globalMeanSim >= 0.95) {
    assessment = 'A. STRONG CANDIDATE';
    assessmentReason = `Preview 1800px delivers ${avgApiSpeedup.toFixed(1)}% faster inference with ${faceRetentionRatePct.toFixed(1)}% overall face retention and high embedding cosine similarity (mean ${globalMeanSim.toFixed(4)}).`;
  } else if (avgApiSpeedup >= 15 && faceRetentionRatePct >= 85) {
    assessment = 'B. NEEDS MORE TESTING';
    assessmentReason = `Preview improves speed by ${avgApiSpeedup.toFixed(1)}%, but face retention (${faceRetentionRatePct.toFixed(1)}%) or embedding similarity shows slight variation that warrants testing on a larger event sample.`;
  } else {
    assessment = 'C. NOT RECOMMENDED';
    assessmentReason = `Preview downscaling shows either insufficient performance gain (${avgApiSpeedup.toFixed(1)}%) or unacceptable face detection loss (retention ${faceRetentionRatePct.toFixed(1)}%).`;
  }

  // Ensure output directory exists
  const outputDir = path.join(process.cwd(), 'benchmark-results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. JSON Report
  const jsonReport = {
    timestamp: new Date().toISOString(),
    photoCount: results.length,
    assessment,
    assessmentReason,
    aggregates: {
      origBytes: { mean: mean(origBytesList), median: median(origBytesList), min: minVal(origBytesList), max: maxVal(origBytesList), p95: percentile(origBytesList, 95) },
      prevBytes: { mean: mean(prevBytesList), median: median(prevBytesList), min: minVal(prevBytesList), max: maxVal(prevBytesList), p95: percentile(prevBytesList, 95) },
      origApiMs: { mean: mean(origApiMsList), median: median(origApiMsList), min: minVal(origApiMsList), max: maxVal(origApiMsList), p95: percentile(origApiMsList, 95) },
      prevApiMs: { mean: mean(prevApiMsList), median: median(prevApiMsList), min: minVal(prevApiMsList), max: maxVal(prevApiMsList), p95: percentile(prevApiMsList, 95) },
      origTotalMs: { mean: mean(origTotalMsList), median: median(origTotalMsList), min: minVal(origTotalMsList), max: maxVal(origTotalMsList), p95: percentile(origTotalMsList, 95) },
      prevTotalMs: { mean: mean(prevTotalMsList), median: median(prevTotalMsList), min: minVal(prevTotalMsList), max: maxVal(prevTotalMsList), p95: percentile(prevTotalMsList, 95) },
      byteReductionPct: { mean: mean(byteReductionList), median: median(byteReductionList), p95: percentile(byteReductionList, 95) },
      apiSpeedupPct: { mean: mean(apiSpeedupList), median: median(apiSpeedupList), p95: percentile(apiSpeedupList, 95) },
      totalSpeedupPct: { mean: mean(totalSpeedupList), median: median(totalSpeedupList), p95: percentile(totalSpeedupList, 95) },
      faceRetentionRatePct,
      identicalFaceCount,
      fewerFacesCount,
      moreFacesCount,
      totalOrigFaces,
      totalPrevFaces,
      globalMeanCosineSimilarity: globalMeanSim,
      globalMinCosineSimilarity: globalMinSim,
    },
    details: results.map((r) => ({
      label: r.label,
      origWidth: r.origWidth,
      origHeight: r.origHeight,
      origBytes: r.origBytes,
      origApiMs: r.origApiMs,
      origTotalMs: r.origTotalMs,
      origFacesCount: r.origFacesCount,
      prevWidth: r.prevWidth,
      prevHeight: r.prevHeight,
      prevBytes: r.prevBytes,
      prevApiMs: r.prevApiMs,
      prevTotalMs: r.prevTotalMs,
      prevFacesCount: r.prevFacesCount,
      byteReductionPct: r.byteReductionPct,
      apiSpeedupPct: r.apiSpeedupPct,
      totalSpeedupPct: r.totalSpeedupPct,
      matchedFacesCount: r.matchedFacesCount,
      meanSimilarity: r.meanSimilarity,
      minSimilarity: r.minSimilarity,
      category: r.category,
    })),
  };

  fs.writeFileSync(path.join(outputDir, 'face-input-benchmark-details.json'), JSON.stringify(jsonReport, null, 2));

  // 2. CSV Report
  const csvLines: string[] = [];
  csvLines.push(
    'Label,Category,Orig_Width,Orig_Height,Orig_Bytes,Prev_Width,Prev_Height,Prev_Bytes,Byte_Reduction_%,Orig_API_Ms,Prev_API_Ms,API_Speedup_%,Orig_Total_Ms,Prev_Total_Ms,Total_Speedup_%,Orig_Faces,Prev_Faces,Matched_Faces,Mean_Similarity,Min_Similarity'
  );

  results.forEach((r) => {
    csvLines.push(
      [
        r.label,
        `"${r.category}"`,
        r.origWidth,
        r.origHeight,
        r.origBytes,
        r.prevWidth,
        r.prevHeight,
        r.prevBytes,
        r.byteReductionPct.toFixed(2),
        r.origApiMs.toFixed(2),
        r.prevApiMs.toFixed(2),
        r.apiSpeedupPct.toFixed(2),
        r.origTotalMs.toFixed(2),
        r.prevTotalMs.toFixed(2),
        r.totalSpeedupPct.toFixed(2),
        r.origFacesCount,
        r.prevFacesCount,
        r.matchedFacesCount,
        r.meanSimilarity.toFixed(4),
        r.minSimilarity.toFixed(4),
      ].join(',')
    );
  });

  fs.writeFileSync(path.join(outputDir, 'face-input-benchmark-details.csv'), csvLines.join('\n'));

  // 3. Markdown Summary Report
  const formatBytesStr = (b: number) => `${(b / (1024 * 1024)).toFixed(2)} MB`;

  const markdownContent = `# Face Input Performance & Accuracy Benchmark Report

Executed at: \`${new Date().toISOString()}\`  
Sample size: **${results.length} photos** (Read-Only sequential evaluation)

---

## Executive Metric Summary

| Metric | Original Image | Preview 1800px | Change / Improvement |
| :--- | :--- | :--- | :--- |
| **Mean Input Size** | ${formatBytesStr(mean(origBytesList))} | ${formatBytesStr(mean(prevBytesList))} | **-${mean(byteReductionList).toFixed(1)}%** byte reduction |
| **Median Input Size** | ${formatBytesStr(median(origBytesList))} | ${formatBytesStr(median(prevBytesList))} | **-${median(byteReductionList).toFixed(1)}%** byte reduction |
| **Mean API Inference** | ${mean(origApiMsList).toFixed(1)} ms | ${mean(prevApiMsList).toFixed(1)} ms | **${mean(apiSpeedupList).toFixed(1)}%** faster |
| **Median API Inference** | ${median(origApiMsList).toFixed(1)} ms | ${median(prevApiMsList).toFixed(1)} ms | **${median(apiSpeedupList).toFixed(1)}%** faster |
| **P95 API Inference** | ${percentile(origApiMsList, 95).toFixed(1)} ms | ${percentile(prevApiMsList, 95).toFixed(1)} ms | **${percentile(apiSpeedupList, 95).toFixed(1)}%** faster |
| **Mean Total Latency** | ${mean(origTotalMsList).toFixed(1)} ms | ${mean(prevTotalMsList).toFixed(1)} ms | **${mean(totalSpeedupList).toFixed(1)}%** faster |
| **Total Detected Faces** | ${totalOrigFaces} faces | ${totalPrevFaces} faces | **${faceRetentionRatePct.toFixed(1)}%** face retention |
| **Embedding Similarity** | — | — | **${globalMeanSim.toFixed(4)}** mean cosine sim |

---

## Face Detection Accuracy Analysis

- **Identical Face Count**: ${identicalFaceCount} / ${results.length} photos (${faceAccuracyIdenticalPct.toFixed(1)}%)
- **Fewer Faces in Preview**: ${fewerFacesCount} / ${results.length} photos (${((fewerFacesCount / results.length) * 100).toFixed(1)}%)
- **More Faces in Preview**: ${moreFacesCount} / ${results.length} photos (${((moreFacesCount / results.length) * 100).toFixed(1)}%)
- **Overall Face Retention**: ${totalPrevFaces} / ${totalOrigFaces} (${faceRetentionRatePct.toFixed(1)}%)
- **Embedding Cosine Similarity**: Mean = **${globalMeanSim.toFixed(4)}**, Min = **${globalMinSim.toFixed(4)}**

---

## Category Breakdown

| Category | Photo Count | Avg Orig Faces | Avg Prev Faces | Face Retention % | Avg API Speedup % |
| :--- | :--- | :--- | :--- | :--- | :--- |
${['No Faces', 'Solo Portrait', 'Small Group (2-4)', 'Large Group (5+)']
  .map((cat) => {
    const catItems = results.filter((r) => r.category === cat);
    if (catItems.length === 0) return null;
    const catOrigFaces = catItems.reduce((s, r) => s + r.origFacesCount, 0);
    const catPrevFaces = catItems.reduce((s, r) => s + r.prevFacesCount, 0);
    const catRet = catOrigFaces > 0 ? (catPrevFaces / catOrigFaces) * 100 : 100;
    const catSpeedup = mean(catItems.map((r) => r.apiSpeedupPct));
    return `| ${cat} | ${catItems.length} | ${(catOrigFaces / catItems.length).toFixed(1)} | ${(catPrevFaces / catItems.length).toFixed(1)} | ${catRet.toFixed(1)}% | ${catSpeedup.toFixed(1)}% |`;
  })
  .filter(Boolean)
  .join('\n')}

---

## Detailed Photo Measurements

| Photo | Dimensions (Orig vs Prev) | Size (Orig vs Prev) | API Ms (Orig vs Prev) | Faces (Orig / Prev) | Matched Sim (Mean) |
| :--- | :--- | :--- | :--- | :--- | :--- |
${results
  .map(
    (r) =>
      `| \`${r.label}\` | ${r.origWidth}x${r.origHeight} → ${r.prevWidth}x${r.prevHeight} | ${(r.origBytes / (1024 * 1024)).toFixed(1)}MB → ${(r.prevBytes / 1024).toFixed(0)}KB (-${r.byteReductionPct.toFixed(0)}%) | ${r.origApiMs.toFixed(0)}ms → ${r.prevApiMs.toFixed(0)}ms (${r.apiSpeedupPct > 0 ? '+' : ''}${r.apiSpeedupPct.toFixed(0)}%) | ${r.origFacesCount} / ${r.prevFacesCount} | ${r.meanSimilarity.toFixed(4)} |`
  )
  .join('\n')}

---

## Production Optimization Assessment

**Classification**: **${assessment}**

${assessmentReason}
`;

  fs.writeFileSync(path.join(outputDir, 'face-input-benchmark-summary.md'), markdownContent);

  console.log('===================================================');
  console.log('               BENCHMARK COMPLETE                  ');
  console.log('===================================================');
  console.log(`Assessment: ${assessment}`);
  console.log(`Summary Report : ${path.join(outputDir, 'face-input-benchmark-summary.md')}`);
  console.log(`CSV Report     : ${path.join(outputDir, 'face-input-benchmark-details.csv')}`);
  console.log(`JSON Report    : ${path.join(outputDir, 'face-input-benchmark-details.json')}\n`);
}

runBenchmark()
  .catch((err) => {
    console.error('Benchmark execution error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
