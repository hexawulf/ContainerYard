import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] w-full items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md border-border/80 shadow-sm">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            404 - Page Not Found
          </h1>
          <p className="text-sm text-muted-foreground">
            The page you are looking for doesn't exist or has been moved.
          </p>
          <div className="pt-2">
            <Link href="/dashboard">
              <Button className="w-full">Return to Dashboard</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
