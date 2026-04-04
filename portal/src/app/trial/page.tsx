import { headers } from "next/headers";
import TrialForm from "./TrialForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TrialPage() {
  // Force dynamic rendering by reading request headers
  const h = await headers();
  void h.get("x-request-id");
  return <TrialForm />;
}
