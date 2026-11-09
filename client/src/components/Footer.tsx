import React from "react";
import Logo from "./Logo";
import { Link } from "wouter";

const Footer: React.FC = () => {
  return (
    <footer className="border-t border-border/80 bg-card/40">
      <div className="mx-auto flex max-w-container flex-col items-center justify-between gap-4 px-4 py-6 sm:px-6 md:h-16 md:flex-row md:py-0">
        <div className="flex items-center gap-2.5 text-center md:text-left">
          <Logo size="xs" />
          <p className="text-xs text-muted-foreground sm:text-sm">
            Built by{" "}
            <a
              href="https://github.com/hexawulf"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
            >
              hexawulf
            </a>
            . Source on{" "}
            <a
              href="https://github.com/hexawulf/ContainerYard"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
            >
              GitHub
            </a>
            .
          </p>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/styleguide">
            <a className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:text-sm">
              Style Guide
            </a>
          </Link>
          <a
            href="https://github.com/hexawulf/ContainerYard#readme"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
          >
            Docs
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
