import { redirect } from "next/navigation";

// Intake is a modal over the library now. The route is kept so existing links
// and the command palette still resolve; it opens the dialog in place.
export default function NewProjectPage() {
  redirect("/?new=1");
}
