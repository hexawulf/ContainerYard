import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import type { ContainerDetail } from "@shared/monitoring";

interface InspectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: ContainerDetail | null;
}

export function InspectModal({ open, onOpenChange, container }: InspectModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!container) return;
    
    const json = JSON.stringify(container, null, 2);
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!container) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Inspect Container</DialogTitle>
          <DialogDescription>{container.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy JSON
                </>
              )}
            </Button>
          </div>

          <ScrollArea className="h-[500px] w-full rounded-md border">
            <pre className="text-xs font-mono p-4">
              {JSON.stringify(container, null, 2)}
            </pre>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
