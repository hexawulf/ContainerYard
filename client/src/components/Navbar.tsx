import React from "react";
import Logo from "./Logo";
import { Button } from "./ui/button";
import { Link, useLocation } from "wouter";
import { useAuth } from "./AuthGate";
import { ThemeToggle } from "./theme-toggle";

const Navbar: React.FC = () => {
  const { user } = useAuth();
  const [location] = useLocation();
  const homeHref = user ? "/dashboard" : "/";
  const isDashboard = location === "/dashboard";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 max-w-container items-center justify-between px-4 sm:px-6">
        <Link href={homeHref}>
          <a className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo size="sm" />
            <span className="text-sm font-semibold tracking-tight text-foreground">
              ContainerYard
            </span>
          </a>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          {!isDashboard && (
            <Link href="/dashboard">
              <Button size="sm">Open Dashboard</Button>
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default Navbar;
