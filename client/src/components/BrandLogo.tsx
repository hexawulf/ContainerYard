import { ReactComponent as Mark } from "@/assets/branding/logo-mark.svg";
import { ReactComponent as Wordmark } from "@/assets/branding/logo-wordmark.svg";

export function BrandLogo({ variant="mark", size=32, className="" }:{
  variant?: "mark"|"wordmark"; size?: number; className?: string
}) {
  const Props = { width:size, height:size, className, role:"img", "aria-label":"ContainerYard" };
  return variant === "wordmark" ? <Wordmark {...Props}/> : <Mark {...Props}/>;
}
