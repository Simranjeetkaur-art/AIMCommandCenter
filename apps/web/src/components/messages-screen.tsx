import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { Empty, Panel, buttonClass } from "@/components/ui";
import { MessageLists } from "@/components/message-lists";
import type { InboxRow, Person } from "@/components/message-lists";
import { LocalTime } from "@/components/local-time";
import { SubmitButton } from "@/components/submit-button";
import { act } from "@/lib/act";

interface Conversation {
  id: string;
  with: Person;
  messages: Array<{
    id: string;
    body: string;
    mine: boolean;
    createdAt: string;
    readAt: string | null;
  }>;
}

/**
 * Messages, for whichever portal is rendering them.
 *
 * One screen: the conversations on the left, the open one on the right. Who
 * a person may write to is decided by the server and served as an address
 * book, so this never offers somebody the API will refuse -- and never has to
 * know the rules itself.
 */
export async function MessagesScreen({
  basePath,
  openId,
  composeWith,
}: {
  basePath: string;
  openId?: string;
  composeWith?: string;
}) {
  const [inbox, book] = await Promise.all([
    api<InboxRow[]>("/messages"),
    api<Person[]>("/messages/address-book"),
  ]);

  const open = openId
    ? await api<Conversation>(`/messages/${openId}`).catch(() => null)
    : null;

  // Composing with somebody there is no conversation with yet.
  const fresh =
    !open && composeWith ? book.find((p) => p.id === composeWith) : undefined;

  async function send(formData: FormData) {
    "use server";
    const recipientId = String(formData.get("recipientId") ?? "");
    const body = String(formData.get("body") ?? "");
    const result = await act<{ conversationId: string }>("/messages", {
      method: "POST",
      body: { recipientId, body },
    });
    revalidatePath(basePath);
    if (result?.conversationId) {
      redirect(`${basePath}?c=${result.conversationId}`);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rule-label">Messages</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 max-w-2xl text-xs text-ink-400">
            Conversations are between two people and are private to them. Who
            you can write to first is decided by your role; anyone who writes
            to you can always be answered.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <MessageLists
          basePath={basePath}
          book={book}
          inbox={inbox}
          openId={openId}
        />

        <Panel
          title={
            open
              ? open.with.name
              : fresh
                ? `New message to ${fresh.name}`
                : "No conversation open"
          }
          hint={
            open
              ? `${open.with.role.toLowerCase()} · ${open.with.email}`
              : fresh
                ? `${fresh.role.toLowerCase()} · ${fresh.email}`
                : "Pick one on the left, or start a new one."
          }
        >
          {!open && !fresh ? (
            <Empty>Nothing open.</Empty>
          ) : (
            <>
              {open ? (
                <ul className="mb-4 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                  {open.messages.map((message) => (
                    <li
                      key={message.id}
                      className={`flex ${message.mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-xl px-3 py-2 ${
                          message.mine
                            ? "bg-brass-500/15 text-ink-100"
                            : "border border-ink-800 bg-ink-900"
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {message.body}
                        </p>
                        <p className="mt-1 text-[10px] text-ink-500">
                          <LocalTime value={message.createdAt} />
                          {message.mine && message.readAt ? " · read" : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              <form action={send} className="space-y-2">
                <input
                  type="hidden"
                  name="recipientId"
                  value={open ? open.with.id : (fresh?.id ?? "")}
                />
                <textarea
                  name="body"
                  required
                  rows={3}
                  maxLength={4000}
                  placeholder={`Write to ${open?.with.name ?? fresh?.name ?? ""}…`}
                  className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm leading-relaxed outline-none focus:border-brass-500"
                />
                <SubmitButton size="md" pendingLabel="Sending…">
                  Send
                </SubmitButton>
              </form>
            </>
          )}
        </Panel>
      </div>

      <Link
        href={`${basePath.replace(/\/messages$/, "")}` || "/"}
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        &larr; Back
      </Link>
    </div>
  );
}
