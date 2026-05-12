import { DeviceTable } from "@/components/DeviceTable";

export default function DevicesPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
        <p className="text-sm text-muted-foreground">
          Registered IoT nodes and gateways. Status reflects whichever device last reported in.
        </p>
      </header>
      <DeviceTable />
    </div>
  );
}
