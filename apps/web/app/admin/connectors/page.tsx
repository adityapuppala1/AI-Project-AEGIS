import { ConnectorAdmin } from "../../../components/connector-admin";

export const metadata = { title: "Connectors" };

export const dynamic = "force-dynamic";
export default function ConnectorsPage() { return <ConnectorAdmin/>; }
