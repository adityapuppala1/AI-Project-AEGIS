import type { Metadata } from "next";

import { WelcomeExperience } from "../../components/welcome/welcome-experience";

export const metadata: Metadata = {
  title: "About AEGIS",
  description: "What AEGIS is, why it was built and how a disaster alert travels from the first signal to the official warning channel. Exercise prototype.",
};

export default function WelcomePage() {
  return <WelcomeExperience />;
}
