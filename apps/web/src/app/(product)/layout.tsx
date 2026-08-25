import { InitialBoot } from "./_components/initial-boot";
import { ProductShell } from "./_components/product-shell";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <InitialBoot><ProductShell>{children}</ProductShell></InitialBoot>;
}
