import { VisitorHint } from "@/components/visitor-hint";
import { Workspace } from "@/components/workspace/workspace-shell";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <VisitorHint><Workspace>{children}</Workspace></VisitorHint>;
}
