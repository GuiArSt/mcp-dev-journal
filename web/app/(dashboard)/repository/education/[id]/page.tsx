import { redirect } from "next/navigation";

export default async function RepositoryEducationRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/library/education/${encodeURIComponent(id)}`);
}
