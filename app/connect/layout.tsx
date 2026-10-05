import { VisitorHint } from "@/components/visitor-hint";

/** Public pages render on the server in the language of the request. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <VisitorHint>{children}</VisitorHint>;
}
