import { exercises } from '@/lib/data/exercises';
import { skillNames, type Scores, type Exercise, type Skill, type Progress } from '@/lib/types';
export const emptyScores = (): Scores => ({
  attention: 0,
  description: 0,
  comparison: 0,
  change: 0,
  inference: 0,
  curiosity: 0,
});
export const emptyProgress = (): Progress => ({ scores: emptyScores(), level: 1, total: 0 });
export function updateScores(current: Scores, evidence: Scores): Scores {
  return Object.fromEntries(
    skillNames.map((k) => [
      k,
      Math.min(100, current[k] + Math.round(Math.max(0, Math.min(5, evidence[k])) * 2)),
    ]),
  ) as Scores;
}
export function levelFor(scores: Scores): number {
  const average = skillNames.reduce((sum, k) => sum + scores[k], 0) / skillNames.length;
  return Math.min(6, 1 + Math.floor(average / 16));
}
export function chooseExercise(progress: Progress, recent: string[] = [], focus?: Skill): Exercise {
  const available = exercises.filter((x) => x.level <= Math.min(6, progress.level + 1));
  const fresh = available.filter((x) => !recent.slice(0, 2).includes(x.id));
  const pool = fresh.length ? fresh : available;
  return (
    pool.find((x) => x.skill === focus) ??
    [...pool].sort((a, b) => progress.scores[a.skill] - progress.scores[b.skill])[0]
  );
}
