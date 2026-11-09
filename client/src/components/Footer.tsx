import React from "react";
import { Link } from "wouter";
import Logo from "./Logo";
import { APP_VERSION } from "./header/AboutModal";

const Footer: React.FC = () => {
  return (
    <footer className="border-t border-border/80 bg-card/40">
      <div className="mx-auto flex max-w-container flex-col items-center justify-between gap-3 px-4 py-5 sm:px-6 md:h-14 md:flex-row md:py-0">
        <div className="flex items-center gap-2.5 text-center md:text-left">
          <Logo size="xs" />
          <p className="text-xs text-muted-foreground sm:text-sm">
            © 2026 ContainerYard ·{" "}
            <span className="font-mono text-xs">v{APP_VERSION}</span> ·
            Self-hosted Docker observability
          </p>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/styleguide">
            <a className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:text-sm">
              Style Guide
            </a>
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
