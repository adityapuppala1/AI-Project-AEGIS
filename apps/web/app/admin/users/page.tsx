import type { Metadata } from "next";
import { UsersAccess } from "../../../components/users-access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Users and access" };
export default function UsersAccessPage() { return <UsersAccess />; }
