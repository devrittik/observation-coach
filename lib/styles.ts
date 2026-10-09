import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));
export const ui = {
  button: 'button',
  primary: 'button button-primary',
  secondary: 'button button-secondary',
  ghost: 'button button-ghost',
  input: 'form-input',
  label: 'form-label',
  card: 'surface-card',
  eyebrow: 'eyebrow',
  page: 'page-shell',
  narrow: 'narrow-shell',
};
