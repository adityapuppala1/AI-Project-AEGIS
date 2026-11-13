import type { Metadata } from "next";
import { AboutAegis } from "../../components/about-aegis";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "About IndTrana" };
export default function AboutPage() { return <AboutAegis />; }
