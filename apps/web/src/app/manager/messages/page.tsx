import { MessagesScreen } from "@/components/messages-screen";

export default async function ManagerMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; to?: string }>;
}) {
  const { c, to } = await searchParams;
  return <MessagesScreen basePath="/manager/messages" openId={c} composeWith={to} />;
}
