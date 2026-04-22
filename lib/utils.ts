import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normaliza espaços: "JOÃO   SILVA" -> "JOÃO SILVA" */
export function normalizeSpaces(str: string) {
  if (!str) return '';
  return str.trim().split(/\s+/).join(' ');
}
