'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Bootstrap } from '@/lib/types';
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const r = await fetch(`/api/${path}`, {
    method: method || (body !== undefined ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error(
      'The application could not be reached. Please check your connection and try again.',
    );
  }
  if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
const Context = createContext<{ data: Bootstrap; refresh: () => Promise<Bootstrap> } | null>(null);
export function CoachProvider({ initial, children }: { initial: Bootstrap; children: ReactNode }) {
  const [data, setData] = useState(initial);
  const refresh = async () => {
    const next = await api<Bootstrap>('bootstrap');
    setData(next);
    return next;
  };
  return <Context.Provider value={{ data, refresh }}>{children}</Context.Provider>;
}
export function useCoach() {
  const context = useContext(Context);
  if (!context) throw new Error('Missing coach provider');
  return context;
}
