import { CommandCenter } from "../components/command-center";
import { WelcomeExperience } from "../components/welcome/welcome-experience";
import { readSession } from "../lib/auth-server";

export const dynamic = "force-dynamic";

// The front door. Visitors see the landing page; a signed-in operator gets the Command Center at the same address.
export default async function HomePage() {
  const operator = await readSession();
  return operator ? <CommandCenter /> : <WelcomeExperience />;
}
