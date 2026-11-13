import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fetchBrand } from "../../lib/brand-proxy";

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await fetchBrand();
  return { title: { default: "Administration", template: `%s | ${name}` } };
}
export default function Layout({ children }: Readonly<{ children: ReactNode }>) { return children; }
