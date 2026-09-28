export interface LearnerRecord {
  user: {
    id: string;
    name: string;
    email: string;
    status: string;
    createdAt: string;
  };
  enrollments: Array<{
    id: string;
    status: string;
    cohort: {
      id: string;
      code: string;
      title: string;
      programmeVersion: {
        id: string;
        version: number;
        requirements: Record<string, unknown>;
        programme: { code: string; title: string; summary: string };
      };
    };
  }>;
  progress: Array<{
    id: string;
    status: string;
    lesson: { id: string; title: string; moduleId: string };
  }>;
  attempts: Array<{
    id: string;
    attemptNo: number;
    score: number | null;
    passed: boolean | null;
    submittedAt: string | null;
    assessment: {
      id: string;
      code: string;
      title: string;
      kind: string;
      passMark: number;
    };
  }>;
  submissions: Array<{
    id: string;
    status: string;
    version: number;
    score: number | null;
    submittedAt: string | null;
    slaDueAt: string | null;
    assessment: { id: string; code: string; title: string; kind: string };
    reviews: Array<{
      id: string;
      decision: string;
      comment: string;
      score: number | null;
      createdAt: string;
    }>;
  }>;
  badges: Array<{
    id: string;
    awardedAt: string;
    badge: { code: string; title: string };
  }>;
  credentials: Array<{
    id: string;
    serial: string;
    status: string;
    issuedAt: string;
    programmeVersion: {
      version: number;
      programme: { code: string; title: string };
    };
  }>;
}
