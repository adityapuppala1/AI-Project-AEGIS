import type { Metadata } from "next";
import { BrandAdmin } from "../../../components/brand-admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Brand" };
export default function BrandPage() { return <BrandAdmin />; }
