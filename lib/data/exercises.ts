import type { Exercise, Skill } from '@/lib/types';
export const exercises: Exercise[] = [
  {
    id: 'overlooked',
    title: 'The quietly overlooked',
    instruction:
      'Find something you pass by often, but rarely really see. Give it your full attention for a minute.',
    hint: 'No need to find something extraordinary. A small, familiar thing is enough.',
    skill: 'attention',
    level: 1,
  },
  {
    id: 'one-minute',
    title: 'Stay with one small thing',
    instruction:
      'Choose one ordinary object. Observe it for 60 seconds, then notice a detail you missed at first.',
    hint: 'Let your eyes slow down. What appears after your first impression?',
    skill: 'attention',
    level: 1,
  },
  {
    id: 'textures',
    title: 'A world of textures',
    instruction:
      'Find three different textures nearby. Look closely and describe how each might feel, without needing to touch.',
    hint: 'Look for edges, surfaces, and the way light rests on them.',
    skill: 'description',
    level: 2,
  },
  {
    id: 'listen',
    title: 'Beyond the loudest sound',
    instruction:
      'Stand somewhere safe and listen for 30 seconds. Notice a quiet sound underneath the obvious ones.',
    hint: 'Where does it seem to come from? Is it steady, repeating, or changing?',
    skill: 'description',
    level: 2,
  },
  {
    id: 'similar',
    title: 'Similar, but not the same',
    instruction:
      'Find two things that look similar. Look closely enough to notice three differences between them.',
    hint: 'Compare their shape, color, texture, or position.',
    skill: 'comparison',
    level: 3,
  },
  {
    id: 'pattern',
    title: 'A little break in the pattern',
    instruction: 'Find a repeating pattern nearby. Notice one place where the pattern changes.',
    hint: 'It could be in leaves, paving stones, shadows, or something else entirely.',
    skill: 'comparison',
    level: 3,
  },
  {
    id: 'perspective',
    title: 'A change of perspective',
    instruction:
      'Observe one thing from two different positions. What changes when you move, and what stays the same?',
    hint: 'Choose a safe place to stand. Small changes in position are enough.',
    skill: 'change',
    level: 4,
  },
  {
    id: 'light',
    title: 'Where the light lands',
    instruction:
      'Watch how light falls across one object. Notice the boundary between light and shadow, and whether it changes.',
    hint: 'You do not need direct sunlight. Reflected light counts, too.',
    skill: 'change',
    level: 4,
  },
  {
    id: 'evidence',
    title: 'Something happened here',
    instruction:
      'Look for a small sign that something happened recently. Separate what you can see from what you think caused it.',
    hint: 'What evidence supports your idea? What else could explain it?',
    skill: 'inference',
    level: 5,
  },
  {
    id: 'curious',
    title: 'Follow a small question',
    instruction:
      'Find something that makes you curious. Stay with it and look for a detail that might help you understand it.',
    hint: 'You do not need an answer. Start with what you can actually observe.',
    skill: 'curiosity',
    level: 1,
  },
  {
    id: 'unnamed',
    title: 'See it without naming it',
    instruction:
      'Observe one thing for a few minutes without using its name. Describe its shape, surface, sound, and changes.',
    hint: 'Let go of the label. What remains when you describe only the details?',
    skill: 'description',
    level: 6,
  },
];
export const durations = [5, 10, 20, 30] as const;
export const sampleObservation =
  'I noticed the bark on a tree beside the path. It was darker than the trees around it, with deep grooves on one side and a smoother patch near the base.';
export const skillInfo: Record<Skill, { label: string; description: string }> = {
  attention: {
    label: 'Attention',
    description: 'Making room for the details you usually pass by.',
  },
  description: {
    label: 'Description',
    description: 'Putting shapes, textures, and sensations into words.',
  },
  comparison: {
    label: 'Comparison',
    description: 'Seeing differences, similarities, and patterns.',
  },
  change: { label: 'Change', description: 'Noticing what shifts with time or perspective.' },
  inference: {
    label: 'Inference',
    description: 'Connecting an idea to the evidence you can observe.',
  },
  curiosity: {
    label: 'Curiosity',
    description: 'Finding a thoughtful question in an ordinary moment.',
  },
};
export const levels = [
  'Attention',
  'Description',
  'Comparison',
  'Change',
  'Inference',
  'Deep observation',
];
