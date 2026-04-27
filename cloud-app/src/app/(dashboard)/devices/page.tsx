import { DeviceTable } from "@/components/DeviceTable";

export default function DevicesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Devices</h1>
        <p className="text-sm text-muted-foreground">Registered IoT nodes and gateways.</p>
      </div>
      <DeviceTable />
    </div>
  );
}
