import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { HostSummary } from "@shared/monitoring";

interface HostSwitcherProps {
  hosts: HostSummary[];
  selectedHostId: string | null;
  onChange: (hostId: string) => void;
  isLoading?: boolean;
}

export function HostSwitcher({ hosts, selectedHostId, onChange, isLoading }: HostSwitcherProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="monitoring-host">Host</Label>
      <Select
        value={selectedHostId ?? undefined}
        onValueChange={onChange}
        disabled={isLoading || hosts.length === 0}
      >
        <SelectTrigger id="monitoring-host">
          <SelectValue placeholder={isLoading ? "Loading hosts…" : "Select host"} />
        </SelectTrigger>
        <SelectContent>
          {hosts.map((host) => (
            <SelectItem key={host.id} value={host.id}>
              {host.name} ({host.nodeLabel})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
