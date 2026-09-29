import { Workspace } from "@/components/workspace/workspace-shell";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <Workspace>{children}</Workspace>;
}
