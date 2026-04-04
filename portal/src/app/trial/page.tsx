import { unstable_noStore as noStore } from "next/cache";
import TrialForm from "./TrialForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function TrialPage() {
  noStore();
  return <TrialForm />;
}
