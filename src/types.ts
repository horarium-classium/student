export interface Lesson {
  start: string;
  end: string;
  lesson: string;
}

export type Schedule = Record<string, Lesson[]>;