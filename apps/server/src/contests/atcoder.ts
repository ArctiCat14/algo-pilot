import type { ContestRecord } from './types.js';
import { fetchText } from '../sync/http.js';

const DAY = 86_400_000;

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSection(html: string, sectionId: string): string {
  const marker = `id="${sectionId}"`;
  const start = html.indexOf(marker);
  if (start < 0) return '';
  const next = html.indexOf('<div id="contest-table-', start + marker.length);
  return html.slice(start, next > start ? next : undefined);
}

function parseAtCoderSection(
  html: string,
  sectionId: string,
  now: number,
): ContestRecord[] {
  const section = parseSection(html, sectionId);
  if (!section) return [];

  const result: ContestRecord[] = [];
  const rows = section.match(/<tr>([\s\S]*?)<\/tr>/g) ?? [];
  for (const row of rows) {
    const timeMatch = row.match(/class=['"]fixtime[^'"]*['"][^>]*>([^<]+)<\/time>/);
    if (!timeMatch) continue;
    const startDate = new Date(
      timeMatch[1].trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'),
    );
    const startAt = startDate.getTime();
    if (!Number.isFinite(startAt)) continue;

    const links = [...row.matchAll(/<a href="\/contests\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const contestLink = links.find((link) => link[1] && !link[1].startsWith('practice'));
    if (!contestLink) continue;

    const contestId = contestLink[1];
    const name = decodeHtml(contestLink[2]);
    if (!name) continue;

    const durationMatch = row.match(/<td class="text-center">(\d{1,2}):(\d{2})<\/td>/);
    const durationSeconds = durationMatch
      ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60
      : 0;
    const endAt = startAt + durationSeconds * 1000;
    if (endAt < now - 30 * DAY || startAt > now + 60 * DAY) continue;

    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) =>
      decodeHtml(cell[1]),
    );
    const ratedRange = cells.at(-1) || '';

    result.push({
      platform: 'atcoder',
      contestId,
      name,
      startAt,
      durationSeconds,
      url: `https://atcoder.jp/contests/${contestId}`,
      note: ratedRange && ratedRange !== '-' ? ratedRange : null,
      source: 'atcoder-official',
    });
  }
  return result;
}

export async function fetchAtCoderContests(): Promise<ContestRecord[]> {
  const html = await fetchText('https://atcoder.jp/contests/', {
    label: 'AtCoder contests',
    attempts: 4,
    timeoutMs: 60_000,
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  const now = Date.now();
  const all = [
    ...parseAtCoderSection(html, 'contest-table-upcoming', now),
    ...parseAtCoderSection(html, 'contest-table-recent', now),
  ];
  const unique = new Map<string, ContestRecord>();
  for (const contest of all) unique.set(contest.contestId, contest);
  return [...unique.values()];
}
