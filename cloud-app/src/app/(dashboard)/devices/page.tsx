import { DeviceTable } from "@/components/DeviceTable";
import { PollIndicator } from "@/components/PollIndicator";

export default function DevicesPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
          <p className="text-sm text-muted-foreground">
            Registered IoT nodes and gateways. Status reflects whichever device last reported in.
          </p>
        </div>
        <PollIndicator intervalSeconds={10} />
      </header>
      <DeviceTable />
    </div>
  );
}
