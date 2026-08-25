import { BootScreen } from "./(product)/_components/boot-screen";

export default function Loading() {
  return <BootScreen config={{ status: "ready", value: null }} projects={{ status: "loading" }} workspace={{ status: "loading" }} />;
}
