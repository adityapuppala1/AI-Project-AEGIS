import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Response Playbooks" };
export default function Layout({ children }: Readonly<{ children: ReactNode }>) { return children; }
