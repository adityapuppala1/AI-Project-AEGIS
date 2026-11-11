import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { WelcomeExperience } from "../../components/welcome/welcome-experience";
import { readSession } from "../../lib/auth-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "About AEGIS",
  description: "What AEGIS is, why it was built and how a disaster alert travels from the first signal to the official warning channel. Exercise prototype.",
};

// Public for signed-out visitors. A signed-in operator stays inside the app and reads the same story at /about.
export default async function WelcomePage() {
  if (await readSession()) redirect("/about");
  return <WelcomeExperience />;
}
