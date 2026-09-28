import { MessagesScreen } from "@/components/messages-screen";

export default async function InstructorMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; to?: string }>;
}) {
  const { c, to } = await searchParams;
  return <MessagesScreen basePath="/instructor/messages" openId={c} composeWith={to} />;
}
