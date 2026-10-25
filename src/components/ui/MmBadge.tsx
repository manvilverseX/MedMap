import React from "react";

export type MmBadgeTone =
  | "verified"
  | "review"
  | "progress"
  | "in-progress"
  | "teal"
  | "neutral";

export interface MmBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: MmBadgeTone;
  dot?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export const MmBadge: React.FC<MmBadgeProps> = ({
  tone = "neutral",
  dot = false,
  children,
  className = "",
  ...props
}) => {
  const normalizedTone = tone === "in-progress" ? "progress" : tone;
  const toneClass = `mm-badge--${normalizedTone}`;
  const combinedClassName = `mm-badge ${toneClass} ${className}`.trim();

  return (
    <span className={combinedClassName} {...props}>
      {dot && <span className="mm-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
};

export const MmStatusChip: React.FC<MmBadgeProps> = (props) => {
  return <MmBadge dot={props.dot ?? true} {...props} />;
};
