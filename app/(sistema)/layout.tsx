import AppShell from "@/components/shell/AppShell";

export default function SistemaLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
