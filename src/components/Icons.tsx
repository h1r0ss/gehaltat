// Decorative inline icons. All are aria-hidden; the surrounding control carries the label.
type IconProps = { className?: string };

const common = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function ExternalLinkIcon({ className }: IconProps) {
  return (
    <svg {...common} width={13} height={13} strokeWidth={1.8} className={className}>
      <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...common} width={12} height={12} strokeWidth={2.2} className={className}>
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

export function FilterIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...common} width={12} height={12} strokeWidth={2.2} className={className}>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M13.5 13.5 10.4 10.4" />
    </svg>
  );
}
