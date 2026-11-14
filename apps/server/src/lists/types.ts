export interface LuoguTrainingSummary {
  externalId: string;
  name: string;
  provider: string;
  problemCount: number;
  markCount: number;
  type: number;
  url: string;
}

export interface LuoguTrainingProblem {
  pid: string;
  name: string;
  difficulty: number;
  tags: number[];
}

export interface LuoguTrainingDetail extends LuoguTrainingSummary {
  description: string;
  problems: LuoguTrainingProblem[];
}

export interface LocalProblemList {
  id: number;
  platform: 'luogu';
  externalId: string;
  name: string;
  provider: string | null;
  url: string;
  problemCount: number;
  solvedCount: number;
  importedAt: number;
  updatedAt: number;
  description: string | null;
  markCount: number;
}

export interface ProblemListItem {
  position: number;
  problemKey: string;
  pid: string;
  title: string;
  difficulty: number | null;
  tags: string[];
  status: 'todo' | 'attempted' | 'solved';
  url: string;
}

export interface LocalProblemListDetail extends LocalProblemList {
  items: ProblemListItem[];
  warnings?: string[];
}
