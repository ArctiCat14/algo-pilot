import type { ContestRecord } from './types.js';
import { fetchText } from '../sync/http.js';

interface NowCoderContestJson {
  contestId?: number;
  contestName?: string;
  contestStartTime?: number;
  contestEndTime?: number;
  contestDuration?: number;
  settingInfo?: {
    organizerName?: string;
    ratingStatus?: string;
    nbCount?: number;
  };
}

function decodeAttribute(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export async function fetchNowCoderContests(): Promise<ContestRecord[]> {
  const html = await fetchText('https://ac.nowcoder.com/acm/contest/vip-index', {
    label: 'NowCoder contests',
    attempts: 4,
    timeoutMs: 60_000,
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });

  const now = Date.now();
  const from = now - 30 * 86_400_000;
  const to = now + 60 * 86_400_000;
  const unique = new Map<string, ContestRecord>();
  const matches = html.matchAll(/data-json="([^"]+)"/g);

  for (const match of matches) {
    try {
      const payload = JSON.parse(decodeAttribute(match[1])) as NowCoderContestJson;
      if (!payload.contestId || !payload.contestName) continue;
      const startAt = Number(payload.contestStartTime);
      const endAt = Number(payload.contestEndTime);
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) continue;
      if (endAt < from || startAt > to) continue;

      const organizer = payload.settingInfo?.organizerName;
      const noteParts = [organizer || '牛客竞赛'];
      if (payload.settingInfo?.nbCount) noteParts.push(`${payload.settingInfo.nbCount} 题`);
      const contestId = String(payload.contestId);

      unique.set(contestId, {
        platform: 'nowcoder',
        contestId,
        name: payload.contestName,
        startAt,
        durationSeconds: Math.max(0, Math.round((endAt - startAt) / 1000)),
        url: `https://ac.nowcoder.com/acm/contest/${contestId}`,
        note: noteParts.join(' · '),
        source: 'nowcoder-official',
      });
    } catch {
      // 牛客页面偶尔会混入其他 data-json，忽略无法解析的节点。
    }
  }

  return [...unique.values()];
}
