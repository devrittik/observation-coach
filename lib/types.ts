export const skillNames = [
  'attention',
  'description',
  'comparison',
  'change',
  'inference',
  'curiosity',
] as const;
export type Skill = (typeof skillNames)[number];
export type Scores = Record<Skill, number>;
export type Provider = 'demo' | 'local' | 'hosted';
export type User = { id: string; name: string; email: string; isDemo: boolean };
export type Exercise = {
  id: string;
  title: string;
  instruction: string;
  hint: string;
  skill: Skill;
  level: number;
};
export type Feedback = {
  reflection: string;
  question: string;
  evidence: Partial<Record<Skill, string>>;
  scores: Scores;
  nextFocus: Skill;
};
export type SessionStatus = 'exercise' | 'outside' | 'reflection' | 'feedback' | 'complete';
export type ObservationSession = {
  id: string;
  duration: number;
  status: SessionStatus;
  exercise: Exercise;
  observation: string | null;
  feedback: Feedback | null;
  followup: string | null;
  nextExercise: Exercise | null;
  provider: Provider;
  startedAt: string;
  outsideAt: string | null;
  completedAt: string | null;
  skillGains?: Scores;
};
export type Progress = { scores: Scores; level: number; total: number };
export type Bootstrap = {
  user: User | null;
  progress: Progress;
  sessions: ObservationSession[];
  provider: Provider;
  configured: boolean;
};
