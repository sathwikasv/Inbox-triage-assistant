import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Inbox, Upload } from "lucide-react";
import { useTriage } from "../store/triage";
import { can } from "../lib/permissions";
import { REPLY_VIEWS, VIEWS, decisionsOf, sortThreads } from "../lib/views";
import { InboxSidebar, threadLabels } from "../components/inbox/InboxSidebar";
import { ThreadTable, type Layout } from "../components/inbox/ThreadTable";
import { ThreadDetail } from "../components/inbox/ThreadDetail";
import { EscalateDialog } from "../components/inbox/EscalateDialog";
import { Button, EmptyState, cn } from "../ui";
import { STARTER_FIXTURE } from "../lib/starter";

export default function WorkspacePage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { run, role, act, preview, importFixture } = useTriage();
  const [view, setView] = useState("all");
  const [label, setLabel] = useState<string | null>(null);
  const [escalating, setEscalating] = useState<string[]>([]);
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      return localStorage.getItem("c16.layout") === "board" ? "board" : "table";
    } catch {
      return "table";
    }
  });
  const [replySignal, setReplySignal] = useState(0);
  const r = run?.result;

  const threads = useMemo(() => {
    if (!r) return [];
    const v = [...VIEWS, ...REPLY_VIEWS].find((x) => x.id === view)!;
    return sortThreads(r, r.threads.filter((t) => (label ? threadLabels(r, t.thread_key).includes(label) : v.test(t, decisionsOf(r, t), run!))));
  }, [r, run, view, label]);
  const open = (k: string) => navigate(`/inbox/${encodeURIComponent(k)}`);
  const selected = key && r?.threads.some((t) => t.thread_key === key) ? key : undefined;

  // j / k move through the list; r opens the reply; Esc closes the thread.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = threads.findIndex((t) => t.thread_key === selected);
      if (e.key === "j" && threads[i + 1]) open(threads[i + 1].thread_key);
      else if (e.key === "k" && i > 0) open(threads[i - 1].thread_key);
      else if (e.key === "r" && selected) {
        e.preventDefault();
        setReplySignal((n) => n + 1);
      } else if (e.key === "Escape" && selected) navigate("/inbox");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!run || !r) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="card w-full max-w-lg">
          <EmptyState
            icon={<Inbox />}
            title="No inbox loaded"
            action={
              <div className="flex gap-2">
                <Button variant="primary" size="md" onClick={() => importFixture(STARTER_FIXTURE, "starter fixture (data/fixture/C16/fixture.json)")}>
                  Load the 12-email fixture
                </Button>
                <Button size="md" onClick={() => navigate("/")}>
                  <Upload className="h-4 w-4" /> Other sources
                </Button>
              </div>
            }
          >
            Import an inbox file to triage it. Nothing is ever sent: replies are drafts for a person to review.
          </EmptyState>
        </div>
      </div>
    );
  }

  const title = label ? `Label: ${label}` : [...VIEWS, ...REPLY_VIEWS].find((v) => v.id === view)!.label;
  const canAct = can(role, "escalate");

  return (
    <div className={cn("grid h-full min-h-0", selected ? "xl:grid-cols-[15rem_24rem_minmax(0,1fr)]" : "lg:grid-cols-[15rem_minmax(0,1fr)]")}>
      <div className="hidden min-h-0 lg:block">
        <InboxSidebar run={run} view={view} onView={setView} label={label} onLabel={setLabel} />
      </div>
      <div className={cn("min-h-0 border-r border-line", selected && "hidden xl:block")}>
        <ThreadTable
          r={r}
          run={run}
          layout={layout}
          onLayout={(l) => {
            setLayout(l);
            try {
              localStorage.setItem("c16.layout", l);
            } catch {
              /* preference not kept */
            }
          }}
          threads={threads}
          title={title}
          selected={selected}
          compact={!!selected}
          actions={{
            open,
            reply: (k) => {
              open(k);
              setReplySignal((n) => n + 1);
            },
            escalate: setEscalating,
            watch: (k) => act(k, "watch"),
            archive: (keys) => keys.filter((k) => k !== "QUARANTINE").forEach((k) => act(k, "archive")),
            previewLabels: (keys) => r.threads.filter((t) => keys.includes(t.thread_key)).forEach((t) => t.email_ids.forEach((id) => preview(id, "label"))),
            canAct,
          }}
        />
      </div>
      {selected && (
        <div className="min-h-0">
          <ThreadDetail r={r} threadKey={selected} onClose={() => navigate("/inbox")} onEscalate={setEscalating} replySignal={replySignal} />
        </div>
      )}
      <EscalateDialog
        r={r}
        keys={escalating}
        onClose={() => setEscalating([])}
        onConfirm={(to, note) => {
          escalating.forEach((k) => act(k, "escalate", { to, note: note || undefined }));
          setEscalating([]);
        }}
      />
    </div>
  );
}
