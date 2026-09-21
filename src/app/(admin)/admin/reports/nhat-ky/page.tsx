import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { NhatKyReport } from "@/components/features/admin/nhat-ky-report";

export const dynamic = "force-dynamic";

export default async function NhatKyPage() {
  try {
    await requireStaff();
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Freports%2Fnhat-ky");
    throw err;
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <NhatKyReport />
    </main>
  );
}
