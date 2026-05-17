import { redirect } from "next/navigation";

export default async function RepositoryExperienceRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/library/experience/${encodeURIComponent(id)}`);
}
