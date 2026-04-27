import { auth } from "@/lib/auth";
import { AlarmTable } from "@/components/AlarmTable";
import { PollIndicator } from "@/components/PollIndicator";

export default async function AlarmsPage() {
  const session = await auth();
  const canAcknowledge = session?.user?.role === "ADMIN" || session?.user?.role === "OPERATOR";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Open alarms</h1>
          <p className="text-sm text-muted-foreground">
            Acknowledge alarms once an operator has reviewed them. Acknowledged alarms move out of
            this view.
          </p>
        </div>
        <PollIndicator intervalSeconds={5} />
      </header>
      <AlarmTable canAcknowledge={canAcknowledge} />
    </div>
  );
}
