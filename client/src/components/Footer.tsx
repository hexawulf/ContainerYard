import React from 'react';
import { BrandLogo } from './BrandLogo';
import { Link } from 'wouter';

const Footer: React.FC = () => {
  return (
    <footer className="border-t">
      <div className="container flex flex-col items-center justify-between gap-4 py-10 md:h-24 md:flex-row md:py-0">
        <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
          <BrandLogo variant="mark" size={24} />
          <p className="text-center text-sm leading-loose md:text-left">
            Built by{' '}
            <a
              href="https://github.com/hexawulf"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              hexawulf
            </a>
            . The source code is available on{' '}
            <a
              href="https://github.com/hexawulf/ContainerYard"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              GitHub
            </a>
            .
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/docs">
            <a className="text-sm font-medium text-muted-foreground hover:text-foreground">Docs</a>
          </Link>
          <Link href="/privacy">
            <a className="text-sm font-medium text-muted-foreground hover:text-foreground">Privacy</a>
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;