import { FilterQuery, Model } from 'mongoose';

/**
 * Latest ReadinessSnapshot per (student, drive).
 *
 * Implemented as an indexed, sorted `find` plus an in-process de-duplication instead of
 * `$sort + $group/$first`. The result is identical, but it only needs core query features, so it also
 * runs on Mongo-compatible servers that lack `$first` (used for offline verification) and keeps
 * memory bounded because snapshots are idempotent (a new row is written only when inputs change).
 * Index used: { student: 1, drive: 1, computedAt: -1 }.
 */
export async function latestSnapshotRows(
  model: Model<any>,
  match: FilterQuery<any>,
  select = 'student drive score dimensions computedAt inputsHash',
): Promise<any[]> {
  const rows = await model.find(match).sort({ computedAt: -1 }).select(select).lean();
  const seen = new Set<string>();
  const out: any[] = [];
  for (const r of rows as any[]) {
    const key = `${r.student}:${r.drive}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
