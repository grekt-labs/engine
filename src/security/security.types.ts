export type TrustBadge = "certified" | "conditional" | "suspicious" | "rejected";
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface SecurityFinding {
  id: string;
  category: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  evidence: string;
  deduction: number;
  recommendation: string;
}

export interface SecurityReport {
  score: number;
  badge: TrustBadge;
  findings: SecurityFinding[];
  categoryScores: Record<string, number>;
  scannedAt: string;
  filesScanned: number;
}
