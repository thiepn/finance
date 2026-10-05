import type { SVGProps } from "react";

export type IconName =
  | "overview"
  | "activity"
  | "scan"
  | "plan"
  | "insights"
  | "accounts"
  | "receipts"
  | "categories"
  | "merchants"
  | "products"
  | "recurring"
  | "goals"
  | "netWorth"
  | "ask"
  | "imports"
  | "rules"
  | "settings"
  | "search"
  | "filter"
  | "plus"
  | "sun"
  | "moon"
  | "chevronRight"
  | "arrowUp"
  | "arrowDown"
  | "receipt"
  | "wallet"
  | "check"
  | "alert";

const paths: Record<IconName, readonly string[]> = {
  overview: ["M3 11.5 12 4l9 7.5", "M5.5 10.5V20h13v-9.5", "M9 20v-6h6v6"],
  activity: ["M4 18V9", "M10 18V5", "M16 18v-7", "M22 18H2"],
  scan: ["M4 8V5a1 1 0 0 1 1-1h3", "M16 4h3a1 1 0 0 1 1 1v3", "M20 16v3a1 1 0 0 1-1 1h-3", "M8 20H5a1 1 0 0 1-1-1v-3", "M7 12h10"],
  plan: ["M5 4h14v16H5z", "M8 8h8", "M8 12h5", "M8 16h3"],
  insights: ["M4 19V9", "M10 19V5", "M16 19v-7", "M22 19H2", "m17 7 2-2 2 2"],
  accounts: ["M3 7h18v12H3z", "M3 10h18", "M7 15h4"],
  receipts: ["M6 3h12v18l-3-2-3 2-3-2-3 2z", "M9 8h6", "M9 12h6", "M9 16h4"],
  categories: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  merchants: ["M4 9h16", "M6 9V6h12v3", "M5 9v11h14V9", "M9 20v-6h6v6"],
  products: ["m4 8 8-4 8 4-8 4z", "M4 8v8l8 4 8-4V8", "M12 12v8"],
  recurring: ["M20 7h-5V2", "M4 17h5v5", "M19 12a7 7 0 0 0-12.6-4.2L5 9", "M5 12a7 7 0 0 0 12.6 4.2L19 15"],
  goals: ["M12 21a9 9 0 1 0-9-9", "M12 17a5 5 0 1 0-5-5", "M12 13a1 1 0 1 0-1-1", "m13 11 7-7", "h-5V2", "v5h5"],
  netWorth: ["M3 19h18", "M5 16l4-5 4 3 6-8", "m16 6 3 0 0 3"],
  ask: ["M4 5h16v12H9l-5 4z", "M8 9h8", "M8 13h5"],
  imports: ["M12 3v12", "m8 11 4 4 4-4", "M5 21h14"],
  rules: ["M4 6h16", "M7 12h10", "M10 18h4"],
  settings: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M12 2v2", "M12 20v2", "m4.93 4.93 1.42 1.42", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m4.93 19.07 1.42-1.42", "m17.66 6.34 1.41-1.41"],
  search: ["m21 21-4.35-4.35", "M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"],
  filter: ["M4 5h16", "M7 12h10", "M10 19h4"],
  plus: ["M12 5v14", "M5 12h14"],
  sun: ["M12 4V2", "M12 22v-2", "m5.64 5.64-1.42-1.42", "m19.78 19.78-1.42-1.42", "M4 12H2", "M22 12h-2", "m5.64 18.36-1.42 1.42", "m19.78 4.22-1.42 1.42", "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"],
  moon: ["M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"],
  chevronRight: ["m9 18 6-6-6-6"],
  arrowUp: ["m5 12 7-7 7 7", "M12 5v14"],
  arrowDown: ["m5 12 7 7 7-7", "M12 19V5"],
  receipt: ["M6 3h12v18l-3-2-3 2-3-2-3 2z", "M9 9h6", "M9 13h6"],
  wallet: ["M3 6h16a2 2 0 0 1 2 2v10H3z", "M3 6V4h14v2", "M16 12h5"],
  check: ["m5 12 4 4L19 6"],
  alert: ["M12 3 2 7h6l-5 4 2 7-5-4-5 4 2-7-5-4h6z"],
};

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {paths[name].map((d, index) => (
        <path d={d} key={index} />
      ))}
    </svg>
  );
}
