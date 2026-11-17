import { useState } from 'react';

interface BrandEmblemProps {
  className?: string;
}

export function BrandEmblem({ className = 'h-7 w-7' }: BrandEmblemProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center border border-[#262626] bg-[#0d0d0d] ${className}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 32 32" className="h-4/5 w-4/5" fill="none">
          <circle cx="16" cy="16" r="13" stroke="#3a3a3a" strokeWidth="1" />
          <circle cx="16" cy="16" r="9.5" stroke="#c3d9f3" strokeWidth="0.75" strokeOpacity="0.6" />
          <polygon points="16,6 24,16 16,26 8,16" stroke="#ffffff" strokeWidth="1.1" fill="#141414" />
          <line x1="16" y1="6" x2="16" y2="26" stroke="#666666" strokeWidth="0.75" />
          <line x1="8" y1="16" x2="24" y2="16" stroke="#666666" strokeWidth="0.75" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-[#262626] bg-black ${className}`}
    >
      <img
        src="/src/assets/images/aureon_brand_emblem_1794927491900.jpg"
        alt="AUREON geometric obsidian and titanium emblem"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
