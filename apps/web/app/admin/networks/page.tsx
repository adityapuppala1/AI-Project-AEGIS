import type { Metadata } from "next";
import { NetworkMaster } from "../../../components/network-master/network-master";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Network Identifier Master" };
export default function NetworksPage() { return <NetworkMaster />; }
