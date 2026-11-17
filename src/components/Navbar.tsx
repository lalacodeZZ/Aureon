import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { BrandEmblem } from './BrandEmblem';

interface NavbarProps {
  onInvestigateClick: () => void;
  investigating: boolean;
  activeSection: string;
}

const NAV_ITEMS = [
  { id: 'core', label: 'Core', href: '#core-section' },
  { id: 'pipeline', label: 'Pipeline', href: '#pipeline-section' },
  { id: 'forensics', label: 'Forensics', href: '#forensics-section' },
  { id: 'recovery', label: 'Recovery', href: '#recovery-section' },
  { id: 'windows', label: 'Windows Kit', href: '#windows-section' },
];

export function Navbar({ onInvestigateClick, investigating }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-[#262626] bg-black/90">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-8 px-6 md:px-10">
        {/* Zone 1: Nav Links (Desktop) / Menu Trigger (Mobile) */}
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#3a3a3a] text-white transition-colors hover:border-white md:hidden"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className="font-machined whitespace-nowrap shrink-0 text-[12px] tracking-[2px] uppercase text-[#999999] transition-colors hover:text-white focus-visible:outline-1 focus-visible:outline-[#c3d9f3]"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        {/* Zone 2: Centered Brand Emblem + Bugatti-tracked Wordmark */}
        <a
          href="#core-section"
          className="font-display inline-flex items-center gap-3 whitespace-nowrap shrink-0 text-[15px] tracking-[6px] uppercase text-white focus-visible:outline-1 focus-visible:outline-[#c3d9f3]"
        >
          <BrandEmblem className="h-7 w-7" />
          <span>AUREON</span>
        </a>

        {/* Zone 3: Single Primary Transparent Pill CTA */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onInvestigateClick}
            disabled={investigating}
            className="btn-aureon-pill !h-9 !px-6 !text-[11px]"
          >
            {investigating ? 'Running...' : 'Investigate'}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          className="border-t border-[#262626] bg-black px-6 py-4 md:hidden"
          aria-label="Mobile navigation"
        >
          <div className="flex flex-col gap-3">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="font-machined py-2 text-[12px] tracking-[2px] uppercase text-[#cccccc] hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
