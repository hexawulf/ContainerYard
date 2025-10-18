import clsx from "clsx";
import markDark from "@/assets/branding/logo-mark.svg?url";
import markLight from "@/assets/branding/logo-mark-white.svg?url";

type Props = {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  title?: string;
};

const sizeMap: Record<NonNullable<Props["size"]>, string> = {
  xs: "w-6 h-6",
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-12 h-12",
  xl: "w-16 h-16",
};

export default function Logo({ size = "lg", className, title = "ContainerYard" }: Props) {
  return (
    <picture className={clsx("block", sizeMap[size], className)} title={title}>
      <source srcSet={markLight} media="(prefers-color-scheme: dark)" />
      <img
        src={markDark}
        alt="ContainerYard"
        loading="eager"
        decoding="async"
        className="block w-full h-full"
      />
    </picture>
  );
}
