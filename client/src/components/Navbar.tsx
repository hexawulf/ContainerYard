import React from 'react';
import { BrandLogo } from './BrandLogo';
import { Button } from './ui/button';
import { Link } from 'wouter';

const Navbar: React.FC = () => {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-container items-center justify-between">
        <Link href="/">
          <a className="flex items-center space-x-2">
            <BrandLogo variant="wordmark" size={120} />
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