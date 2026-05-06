import { DashboardOverview } from "@/components/DashboardOverview";
import { loadDashboardOverview } from "@/lib/dashboard-overview";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const counts = await loadDashboardOverview();
  return <DashboardOverview initialCounts={counts} />;
}
