import React from "react";
import { MmIcon, type MmIconName } from "./MmIcon";

export type MmButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type MmButtonSize = "sm" | "md" | "lg";

export interface MmButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: MmButtonVariant;
  size?: MmButtonSize;
  icon?: MmIconName | React.ReactNode;
  iconPosition?: "start" | "end";
  children?: React.ReactNode;
  className?: string;
}

export const MmButton: React.FC<MmButtonProps> = ({
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "start",
  children,
  className = "",
  type = "button",
  disabled,
  ...props
}) => {
  const variantClass = `mm-button--${variant}`;
  const sizeClass = size !== "md" ? `mm-button--${size}` : "";
  const combinedClassName = `mm-button ${variantClass} ${sizeClass} ${className}`.trim();

  const iconElement =
    typeof icon === "string" ? (
      <MmIcon name={icon as MmIconName} size={size === "sm" ? 14 : size === "lg" ? 20 : 18} />
    ) : (
      icon
    );

  return (
    <button
      type={type}
      disabled={disabled}
      className={combinedClassName}
      {...props}
    >
      {icon && iconPosition === "start" && iconElement}
      {children}
      {icon && iconPosition === "end" && iconElement}
    </button>
  );
};
