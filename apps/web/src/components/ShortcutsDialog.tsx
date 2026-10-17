import { Dialog, Kbd } from "../ui";

const GROUPS: { title: string; keys: [string[], string][] }[] = [
  {
    title: "Inbox",
    keys: [
      [["j"], "Next conversation"],
      [["k"], "Previous conversation"],
      [["x"], "Select the open conversation"],
      [["e"], "Archive"],
      [["s"], "Star or unstar"],
      [["Shift", "u"], "Mark as unread"],
      [["r"], "Write a reply"],
      [["Esc"], "Back to the list"],
    ],
  },
  {
    title: "Anywhere",
    keys: [
      [["/"], "Search mail"],
      [["Ctrl", "K"], "Command menu"],
      [["?"], "This list"],
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" description="Work through your inbox without the mouse." wide>
      <div className="grid gap-6 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="label-xs mb-2">{g.title}</div>
            <ul className="space-y-1.5">
              {g.keys.map(([k, label]) => (
                <li key={label} className="flex items-center justify-between gap-3 text-sm">
                  <span>{label}</span>
                  <span className="flex gap-1">
                    {k.map((x) => (
                      <Kbd key={x}>{x}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
