import { notFound } from "next/navigation";

import { AnalysisWorkspace } from "@/features/analysis/analysis-workspace";
import { ReviewWorkspace } from "@/features/review/review-workspace";
import { ApiClientError, getProject } from "@/lib/api-client";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ case?: string }> }) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  let project;
  try {
    project = await getProject(projectId);
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "not_found") notFound();
    throw error;
  }
  return project.phase === "ready" ? <ReviewWorkspace initialCaseId={query.case} project={project} /> : <AnalysisWorkspace initialProject={project} />;
}
