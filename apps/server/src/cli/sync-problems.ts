import { closeDatabase, getDatabaseInfo, getPlatformCounts } from '../db.js';
import { syncProblemBank } from '../sync/index.js';
import { PLATFORMS, PLATFORM_META, isPlatform, type Platform } from '../types.js';

interface CliOptions {
  platforms: Platform[];
  luoguPages?: number;
  luoguConcurrency?: number;
}

function printHelp(): void {
  console.log(`
AlgoPilot 题库同步

用法：
  npm run sync -- [选项]

选项：
  --platform <列表>   要同步的平台，逗号分隔：codeforces,atcoder,luogu
                      默认全部
  --pages <数量>      仅同步洛谷前 N 页（调试用，默认全量）
  --concurrency <n>   洛谷抓取并发数，1-4，默认 3
  --help              显示帮助

示例：
  npm run sync -- --platform codeforces
  npm run sync -- --platform luogu --pages 10
  npm run sync
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { platforms: [...PLATFORMS] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--platform') {
      const value = argv[index + 1];
      if (!value) throw new Error('--platform 需要一个值');
      const values = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const invalid = values.filter((item) => !isPlatform(item));
      if (invalid.length) throw new Error(`未知平台：${invalid.join(', ')}`);
      options.platforms = values as Platform[];
      index += 1;
      continue;
    }
    if (arg === '--pages') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error('--pages 必须是正整数');
      options.luoguPages = value;
      index += 1;
      continue;
    }
    if (arg === '--concurrency') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 4) {
        throw new Error('--concurrency 必须是 1-4 的整数');
      }
      options.luoguConcurrency = value;
      index += 1;
      continue;
    }
    throw new Error(`未知参数：${arg}`);
  }

  return options;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

const options = parseArgs(process.argv.slice(2));
const lastProgress = new Map<Platform, number>();

console.log('');
console.log('  AlgoPilot · 题库同步');
console.log(`  平台：${options.platforms.map((platform) => PLATFORM_META[platform].label).join(' / ')}`);
if (options.luoguPages) console.log(`  洛谷限量：前 ${options.luoguPages} 页`);
console.log('');

const summary = await syncProblemBank({
  ...options,
  onProgress: (progress) => {
    if (progress.phase === 'fetching') {
      if (progress.total) {
        const percent = Math.floor((progress.current / progress.total) * 100);
        const previous = lastProgress.get(progress.platform) ?? -10;
        if (percent >= previous + 10 || percent === 100) {
          lastProgress.set(progress.platform, percent);
          console.log(`  [${PLATFORM_META[progress.platform].short}] ${percent}% · ${progress.message}`);
        }
      } else {
        console.log(`  [${PLATFORM_META[progress.platform].short}] ${progress.message}`);
      }
    }
    if (progress.phase === 'writing' || progress.phase === 'done' || progress.phase === 'error') {
      console.log(`  [${PLATFORM_META[progress.platform].short}] ${progress.message}`);
    }
  },
});

console.log('');
console.log('  同步结果');
console.log('  ─────────────────────────────────────────────────────────────');
for (const result of summary.results) {
  const icon = result.status === 'success' ? '✓' : '✕';
  console.log(
    `  ${icon} ${PLATFORM_META[result.platform].label.padEnd(12)} `
      + `${result.fetched.toLocaleString().padStart(7)} 道  `
      + `${formatDuration(result.durationMs).padStart(8)}  ${result.status === 'success' ? '' : result.message}`,
  );
}
console.log('  ─────────────────────────────────────────────────────────────');
console.log(`  总耗时 ${formatDuration(summary.finishedAt - summary.startedAt)}`);

const counts = getPlatformCounts();
console.log('');
console.log('  当前题库');
for (const row of counts) {
  console.log(`  · ${PLATFORM_META[row.platform].label.padEnd(12)} ${row.count.toLocaleString().padStart(7)} 道`);
}
const info = getDatabaseInfo();
console.log(`  数据库：${info.path} (${(info.size / 1024 / 1024).toFixed(1)} MB)`);
console.log('');

closeDatabase();
process.exitCode = summary.results.some((result) => result.status === 'error') ? 1 : 0;
