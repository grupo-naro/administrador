import { AdminNav } from "@/components/admin-nav";
import { requireAdmin } from "@/lib/auth-guard";

export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="min-h-screen md:flex">
      <AdminNav email={user.email ?? ""} />
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
