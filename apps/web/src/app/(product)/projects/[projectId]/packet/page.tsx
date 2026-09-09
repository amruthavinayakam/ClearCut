import { PacketPreview } from "@/features/packet/packet-preview";
import { notFound } from "next/navigation";

import { apiTextRequest, getProject, isNotFound } from "@/lib/api-client";

export const dynamic = "force-dynamic";

export default async function PacketPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  let project;
  let markdown;
  try {
    [project, markdown] = await Promise.all([
      getProject(projectId),
      apiTextRequest(`/api/projects/${encodeURIComponent(projectId)}/packet.md`),
    ]);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  // The header belongs to the preview: it carries the readiness figures and the
  // export action, which are properties of the packet rather than the route.
  return <PacketPreview initialMarkdown={markdown} project={project} />;
}
