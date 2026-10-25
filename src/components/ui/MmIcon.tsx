import React from "react";

export type MmIconName =
  | "home"
  | "spark"
  | "file"
  | "users"
  | "shield"
  | "help"
  | "mic"
  | "upload"
  | "arrow"
  | "check"
  | "clock"
  | "heart"
  | "bell"
  | "search"
  | "chevron"
  | "calendar"
  | "pill"
  | "flask"
  | "alert"
  | "timeline"
  | "language"
  | "logout";

export interface MmIconProps extends React.SVGProps<SVGSVGElement> {
  name: MmIconName;
  size?: number | string;
  className?: string;
}

const GLYPHS: Record<MmIconName, React.ReactNode> = {
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8L12 3Z" />
      <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
    </>
  ),
  file: (
    <>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v5h5M9 12h6M9 16h6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20v-2.3A4.7 4.7 0 0 1 8.2 13h1.6a4.7 4.7 0 0 1 4.7 4.7V20" />
      <path d="M16 5.3a3 3 0 0 1 0 5.4M17 13.3a4.7 4.7 0 0 1 3.5 4.5V20" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9a2.4 2.4 0 1 1 3.6 2.1c-.9.5-1.4 1-1.4 2M12 17h.01" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4 15v5h16v-5" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  heart: (
    <>
      <path d="M20.8 5.7a5.4 5.4 0 0 0-7.6 0L12 6.9l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.7a5.4 5.4 0 0 0 0-7.6Z" />
      <path d="M7 12h2l1.2-2.5L13 15l1.3-3H17" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  pill: (
    <>
      <path d="M7.5 19.5a4.95 4.95 0 0 1-3-8.8l6.2-6.2a4.95 4.95 0 0 1 7 7l-6.2 6.2a4.95 4.95 0 0 1-4 1.8Z" />
      <path d="m8 7 9 9" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
  timeline: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="7" cy="19" r="2" />
      <path d="M8 6h3a3 3 0 0 1 3 3v0a3 3 0 0 0 3 3M16 13a5 5 0 0 1-5 5H9" />
    </>
  ),
  language: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10" />
    </>
  ),
};

export const MmIcon: React.FC<MmIconProps> = ({
  name,
  size = 20,
  className = "",
  ...props
}) => {
  const glyph = GLYPHS[name];
  if (!glyph) {
    return null;
  }

  const ariaHidden = props["aria-label"] ? undefined : (props["aria-hidden"] ?? true);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className={`mm-icon ${className}`.trim()}
      {...props}
    >
      {glyph}
    </svg>
  );
};
