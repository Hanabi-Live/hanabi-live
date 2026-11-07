import type { ReactNode } from "react";

export function DialogField({
  label,
  icon,
  children,
  width = 9,
  accessory,
}: {
  label: string;
  icon: string;
  children: ReactNode;
  width?: 7 | 8 | 9;
  accessory?: ReactNode;
}) {
  return (
    <div className="row">
      <div className="col-3 input-text">
        <div className="create-game-icon">
          <i
            aria-hidden="true"
            className={`fas fa-${icon}${icon === "key" || icon === "users" ? " nav-icon" : ""}`}
          />
        </div>{" "}
        {label}
      </div>
      <div className={`col-${width}`}>{children}</div>
      {accessory}
    </div>
  );
}
