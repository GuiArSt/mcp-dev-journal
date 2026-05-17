import { redirect } from "next/navigation";

export default async function RepositorySkillRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/library/skill/${encodeURIComponent(id)}`);
}
