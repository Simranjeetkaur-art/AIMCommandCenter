import { MessagesScreen } from "@/components/messages-screen";

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; to?: string }>;
}) {
  const { c, to } = await searchParams;
  return <MessagesScreen basePath="/admin/messages" openId={c} composeWith={to} />;
}
