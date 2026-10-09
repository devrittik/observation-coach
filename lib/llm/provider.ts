import { z } from 'zod';
import type { Exercise, Feedback, Progress, Provider, Skill } from '@/lib/types';
import { skillNames } from '@/lib/types';
import { emptyScores, chooseExercise } from '@/lib/observation/progression';
import { coachSystem, analysisPrompt, exercisePrompt } from './prompts';
import { feedbackSchema, exerciseSchema } from './schemas';
export class CoachError extends Error {}
export function providerConfig(): { provider: Provider; configured: boolean } {
  const p = process.env.LLM_PROVIDER || 'demo';
  if (!['demo', 'local', 'hosted'].includes(p))
    throw new CoachError('LLM_PROVIDER must be demo, local, or hosted.');
  const provider = p as Provider;
  return {
    provider,
    configured:
      provider === 'demo' ||
      (provider === 'local'
        ? !!(process.env.LOCAL_LLM_BASE_URL && process.env.LOCAL_LLM_MODEL)
        : !!(
            process.env.HOSTED_LLM_BASE_URL &&
            process.env.HOSTED_LLM_MODEL &&
            process.env.HOSTED_LLM_API_KEY
          )),
  };
}
async function request<T>(
  provider: Provider,
  prompt: string,
  data: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const prefix = provider === 'local' ? 'LOCAL_LLM' : 'HOSTED_LLM';
  const base = process.env[`${prefix}_BASE_URL`],
    model = process.env[`${prefix}_MODEL`],
    key = process.env[`${prefix}_API_KEY`];
  if (!base || !model || (provider === 'hosted' && !key))
    throw new CoachError(
      `${provider === 'local' ? 'Local' : 'Hosted'} coaching needs setup. Configure ${prefix}_BASE_URL, ${prefix}_MODEL${provider === 'hosted' ? ', and HOSTED_LLM_API_KEY' : ''} on the server, then restart. You can still explore the separate guided demo.`,
    );
  try {
    const url = new URL(base);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL');
    const response = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.45,
        max_tokens: 1100,
        messages: [
          { role: 'system', content: coachSystem + '\n' + prompt },
          { role: 'user', content: JSON.stringify(data) },
        ],
      }),
      signal: AbortSignal.timeout(45000),
      cache: 'no-store',
    });
    if (!response.ok)
      throw new CoachError(
        `The ${provider} model returned an error (${response.status}). Check the endpoint, model, and credentials on the server. Your written reflection has been saved.`,
      );
    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string' || raw.length > 20000) throw new Error('Invalid model response');
    const parsed = JSON.parse(raw.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, ''));
    return schema.parse(parsed);
  } catch (e) {
    if (e instanceof CoachError) throw e;
    throw new CoachError(
      `The ${provider} coach could not return a valid response. Check that the model is reachable and supports the requested JSON format, then retry. No other provider was used.`,
    );
  }
}
function demoAnalysis(text: string): Feedback {
  const scores = emptyScores();
  const evidence: Feedback['evidence'] = {};
  const rules: Partial<Record<Skill, RegExp>> = {
    description:
      /\b(rough|smooth|groove\w*|dark\w*|bright|green|yellow|red|blue|soft|hard|texture\w*|sound\w*|bark|round|sharp|cold|warm)\b/i,
    comparison: /\b(than|different|similar|compared|unlike|both|whereas)\b/i,
    change: /\b(changed?|moving|moved|shift\w*|sway\w*|became|turned|then)\b/i,
    inference: /\b(because|perhaps|might|evidence|caused|could mean)\b/i,
    curiosity: /\b(wonder\w*|curious|why|how|question)\b/i,
  };
  if (text.trim().split(/\s+/).length >= 3) {
    scores.attention = 2;
    evidence.attention = text.trim().slice(0, 120);
  }
  for (const [skill, re] of Object.entries(rules)) {
    const match = text.match(re!);
    if (match) {
      scores[skill as Skill] = 3;
      const at = Math.max(0, (match.index || 0) - 25);
      evidence[skill as Skill] = text.slice(at, Math.min(text.length, at + 110));
    }
  }
  let reflection =
    'You have a starting point. Try describing one detail someone else could picture.';
  let question = 'What is one specific detail you noticed about it?';
  let nextFocus: Skill = 'description';
  if (scores.comparison) {
    reflection =
      'Your description makes a comparison with what was nearby. That difference gives your observation a clear point of reference.';
    question = 'Which detail would you watch to find out whether it changes over time?';
    nextFocus = 'change';
  } else if (scores.description) {
    reflection =
      'You put a sensory detail into words. Stay with that detail rather than rushing to name or explain it.';
    question = 'What made that particular detail stand out from its surroundings?';
    nextFocus = 'comparison';
  } else if (scores.change) {
    reflection =
      'You described a change. Distinguishing what changed from what stayed the same can make it more precise.';
    question = 'What stayed the same while that change happened?';
    nextFocus = 'comparison';
  }
  return { reflection, question, evidence, scores, nextFocus };
}
export const llmService = {
  async generateObservationExercise(
    provider: Provider,
    progress: Progress,
    recent: string[] = [],
    duration = 5,
  ): Promise<Exercise> {
    return provider === 'demo'
      ? chooseExercise(progress, recent)
      : request(
          provider,
          exercisePrompt,
          { progress, recent, duration },
          exerciseSchema.refine(
            (e) => e.level <= Math.min(6, progress.level + 1),
            'Exercise difficulty advanced too far',
          ),
        );
  },
  async analyzeObservation(
    provider: Provider,
    observation: string,
    exercise: Exercise,
  ): Promise<Feedback> {
    const result =
      provider === 'demo'
        ? demoAnalysis(observation)
        : await request(provider, analysisPrompt, { observation, exercise }, feedbackSchema);
    // Scores require evidence literally present in the user's text.
    for (const skill of skillNames) {
      const quote = result.evidence[skill];
      if (!quote || !observation.includes(quote)) {
        result.scores[skill] = 0;
        delete result.evidence[skill];
      }
    }
    return result;
  },
  generateFollowUp(analysis: Feedback): string {
    return analysis.question;
  },
  async generateNextExercise(
    provider: Provider,
    progress: Progress,
    recent: string[],
    feedback: Feedback,
    observation: string,
    followup: string,
  ): Promise<Exercise> {
    return provider === 'demo'
      ? chooseExercise(progress, recent, feedback.nextFocus)
      : request(
          provider,
          exercisePrompt,
          { progress, recent, feedback, observation, followup },
          exerciseSchema.refine(
            (e) => e.level <= Math.min(6, progress.level + 1),
            'Exercise difficulty advanced too far',
          ),
        );
  },
};
