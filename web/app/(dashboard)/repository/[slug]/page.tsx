import { redirect } from "next/navigation";

export default async function RepositoryDocumentRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/library/${encodeURIComponent(slug)}`);
}
