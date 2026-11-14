export interface WeaknessTag {
  tag: string;
  attempts: number;
  attemptedProblems: number;
  solvedProblems: number;
  acSubmissions: number;
  solveRate: number;
  submissionAcRate: number;
  attemptsPerSolved: number;
  avgDifficulty: number | null;
  lastAt: number | null;
  daysSince: number | null;
  totalProblems: number;
  coverage: number;
  mastery: number;
  weakness: number;
  confidence: 'high' | 'medium' | 'low';
  failureData: boolean;
  reasons: string[];
}

export interface DifficultyBucket {
  label: string;
  min: number;
  max: number;
  attempts: number;
  attemptedProblems: number;
  solvedProblems: number;
  solveRate: number;
  attemptsPerSolved: number;
}

export interface WeaknessSuggestion {
  tag: string;
  title: string;
  reason: string;
}

export interface UntouchedTag {
  tag: string;
  totalProblems: number;
}

export interface WeaknessReport {
  hasData: boolean;
  totalSubmissions: number;
  taggedSubmissions: number;
  totalSolved: number;
  lastSubmissionAt: number | null;
  overallSolveRate: number;
  overallAttemptsPerSolved: number;
  overallAvgDifficulty: number | null;
  tagCoverage: number;
  weaknesses: WeaknessTag[];
  strengths: WeaknessTag[];
  radar: WeaknessTag[];
  difficulty: DifficultyBucket[];
  comfortCeiling: string | null;
  suggestions: WeaknessSuggestion[];
  untouched: UntouchedTag[];
  sourceNote: string;
}
