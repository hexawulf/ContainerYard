import React from 'react';
import Logo from './Logo';
import { Button } from './ui/button';
import { Link } from 'wouter';
import { useAuth } from './AuthGate';

const Navbar: React.FC = () => {
  const { user } = useAuth();
  const homeHref = user ? "/dashboard" : "/";

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-container items-center justify-between">
        <Link href={homeHref}>
          <a className="flex items-center gap-2">
            <Logo size="md" />
            <span className="sr-only sm:not-sr-only sm:text-sm font-semibold tracking-wide">
              ContainerYard
            </span>
          </a>
        </Link>
        <div className="flex items-center space-x-4">
          <Link href="/dashboard">
            <Button>Open Dashboard</Button>
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;