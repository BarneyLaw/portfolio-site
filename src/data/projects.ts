export type ProjectStatus = "SHIPPED" | "BUILDING" | "PLANNED";

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  tags: string[];
  meta: string;
  description: string;
  codeSnippet: string;
}

export const projects: Project[] = [
  {
    id: "relic-overlay",
    name: "relic overlay",
    status: "SHIPPED",
    tags: ["Electron", "overlay", "market API"],
    meta: "Warframe · overlay",
    description:
      "A real-time market overlay for Warframe that pulls live relic pricing data and displays it on-screen while you play. Hooks into the Warframe.market API and a local game log watcher.",
    codeSnippet: "$ npm run dev\n▸ overlay listening on :9990\n▸ log watcher active",
  },
  {
    id: "k3s-cluster",
    name: "k3s cluster",
    status: "BUILDING",
    tags: ["k3s", "Kubernetes", "Ansible"],
    meta: "k3s · self-host",
    description:
      "Four-node bare-metal k3s cluster running at home on repurposed Intel NUCs. Provisioned with Ansible, serving this site and a handful of personal services behind Traefik.",
    codeSnippet: "$ kubectl get nodes\nNAME    STATUS   ROLES\nnuc-0   Ready    control-plane\nnuc-1   Ready    worker",
  },
  {
    id: "obsync",
    name: "obsync",
    status: "PLANNED",
    tags: ["Go", "Postgres"],
    meta: "Go · Postgres",
    description:
      "Self-hosted Obsidian sync server written in Go. The official sync product is fine but I'd rather own the infra. Will use Postgres for vault snapshots and conflict resolution.",
    codeSnippet: "// coming soon",
  },
  {
    id: "lan-drop",
    name: "lan-drop",
    status: "PLANNED",
    tags: ["C++", "networking"],
    meta: "C++ · hole-punch",
    description:
      "LAN-first file drop utility with UDP hole-punching fallback for cross-NAT transfers. Basically AirDrop but for Linux and with a CLI.",
    codeSnippet: "// coming soon",
  },
];
