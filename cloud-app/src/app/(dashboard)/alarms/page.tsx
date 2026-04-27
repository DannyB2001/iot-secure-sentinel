import { auth } from "@/lib/auth";
import { AlarmTable } from "@/components/AlarmTable";

export default async function AlarmsPage() {
  const session = await auth();
  const canAcknowledge = session?.user?.role === "ADMIN" || session?.user?.role === "OPERATOR";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Open alarms</h1>
        <p className="text-sm text-muted-foreground">Auto-refreshes every 5 seconds.</p>
      </div>
      <AlarmTable canAcknowledge={canAcknowledge} />
    </div>
  );
}
