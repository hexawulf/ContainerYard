import clsx from "clsx";

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
    <img
      src="/assets/branding/logo-mark.svg"
      alt="ContainerYard"
      title={title}
      className={clsx("block", sizeMap[size], className)}
      loading="eager"
      decoding="async"
    />
  );
}
