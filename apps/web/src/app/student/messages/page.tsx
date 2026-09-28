import { MessagesScreen } from "@/components/messages-screen";

export default async function StudentMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; to?: string }>;
}) {
  const { c, to } = await searchParams;
  return <MessagesScreen basePath="/student/messages" openId={c} composeWith={to} />;
}
