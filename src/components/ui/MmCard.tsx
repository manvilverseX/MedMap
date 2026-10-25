import React from "react";

export type MmCardVariant = "default" | "elevated" | "accent-teal" | "accent-coral" | "flat";

export interface MmCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: MmCardVariant;
  children?: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}

export const MmCard: React.FC<MmCardProps> = ({
  variant = "default",
  children,
  className = "",
  as: Component = "div",
  ...props
}) => {
  const variantClass = variant !== "default" ? `mm-card--${variant}` : "";
  const combinedClassName = `mm-card ${variantClass} ${className}`.trim();

  return (
    <Component className={combinedClassName} {...props}>
      {children}
    </Component>
  );
};
