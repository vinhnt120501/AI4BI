export type PageKey = 'overview' | 'analysis' | 'explore';

export interface AnalysisTarget {
  prompt: string;
  sessionId?: string;
}
