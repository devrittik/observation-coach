import { z } from 'zod';
export const skillSchema = z.enum([
  'attention',
  'description',
  'comparison',
  'change',
  'inference',
  'curiosity',
]);
export const scoreSchema = z.object({
  attention: z.number().int().min(0).max(5),
  description: z.number().int().min(0).max(5),
  comparison: z.number().int().min(0).max(5),
  change: z.number().int().min(0).max(5),
  inference: z.number().int().min(0).max(5),
  curiosity: z.number().int().min(0).max(5),
});
export const feedbackSchema = z.object({
  reflection: z.string().min(1).max(650),
  question: z
    .string()
    .min(1)
    .max(300)
    .refine((s) => (s.match(/\?/g) || []).length === 1, 'Ask exactly one question'),
  evidence: z.record(skillSchema, z.string().max(400)),
  scores: scoreSchema,
  nextFocus: skillSchema,
});
export const exerciseSchema = z.object({
  id: z.string().min(1).max(60),
  title: z.string().min(1).max(80),
  instruction: z.string().min(10).max(500),
  hint: z.string().max(250),
  skill: skillSchema,
  level: z.number().int().min(1).max(6),
});
