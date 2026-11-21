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
  id?: string;
  className?: string;
  label?: string;
}

export function HostSwitcher({
  hosts,
  selectedHostId,
  onChange,
  isLoading,
  id = "monitoring-host",
  className = "space-y-2",
  label = "Host",
}: HostSwitcherProps) {
  const hasValidSelection =
    Boolean(selectedHostId) &&
    Array.isArray(hosts) &&
    hosts.some((host) => host.id === selectedHostId);

  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={hasValidSelection ? (selectedHostId as string) : undefined}
        onValueChange={onChange}
        disabled={isLoading || !Array.isArray(hosts) || hosts.length === 0}
      >
        <SelectTrigger id={id} data-testid="host-switcher">
          <SelectValue placeholder={isLoading ? "Loading hosts…" : "Select host"} />
        </SelectTrigger>
        <SelectContent>
           {Array.isArray(hosts) && hosts.map((host) => (
            <SelectItem key={host.id} value={host.id}>
              {host.name} ({host.nodeLabel})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
