import { unstable_noStore as noStore } from "next/cache";
import OnboardingForm from "./OnboardingForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function OnboardingPage() {
  noStore();
  return <OnboardingForm />;
}
