import React from "react";
import { LayoutDashboard } from "lucide-react";
import { Link, useLocation } from "wouter";
import Logo from "./Logo";
import { useAuth } from "./AuthGate";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { AboutModal } from "./header/AboutModal";
import { ChangePasswordModal } from "./header/ChangePasswordModal";
import { UsersModal } from "./header/UsersModal";
import { LogoutButton } from "./header/LogoutButton";

const Navbar: React.FC = () => {
  const { user } = useAuth();
  const [location] = useLocation();
  const homeHref = user ? "/dashboard" : "/";
  const isDashboard = location === "/dashboard";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 max-w-container items-center justify-between gap-2 px-3 sm:px-6">
        <Link href={homeHref}>
          <a
            aria-label="ContainerYard home"
            className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo size="sm" />
            <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline">
              ContainerYard
            </span>
          </a>
        </Link>

        <div
          data-testid="navbar-actions"
          className="flex items-center gap-1.5 sm:gap-2"
        >
          {!isDashboard && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  size="sm"
                  className="h-9 w-9 shrink-0 px-0 sm:w-auto sm:px-3"
                >
                  <Link
                    href="/dashboard"
                    aria-label="Open Dashboard"
                    data-testid="button-open-dashboard"
                  >
                    <LayoutDashboard
                      className="h-4 w-4 sm:mr-1.5"
                      aria-hidden="true"
                    />
                    <span className="hidden sm:inline">Open Dashboard</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">
                Open Dashboard
              </TooltipContent>
            </Tooltip>
          )}

          <AboutModal />
          <ThemeToggle />

          {user && <ChangePasswordModal />}
          {user?.role === "ADMIN" && <UsersModal />}
          {user && <LogoutButton />}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
