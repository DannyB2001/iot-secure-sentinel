import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { AlarmTable } from "@/components/AlarmTable";

export default async function AlarmsPage() {
  const session = await auth();
  const canAcknowledge = session?.user?.role === "ADMIN" || session?.user?.role === "OPERATOR";

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Open alarms</h1>
        <p className="text-sm text-muted-foreground">
          Acknowledge alarms once an operator has reviewed them. Acknowledged ones move out of this
          view.
        </p>
      </header>
      <Suspense>
        <AlarmTable canAcknowledge={canAcknowledge} />
      </Suspense>
    </div>
  );
}
