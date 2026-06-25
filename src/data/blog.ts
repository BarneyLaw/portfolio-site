export interface BlogPost {
  id: number;
  date: string;
  readTime: string;
  category: string;
  title: string;
  excerpt: string;
  featured: boolean;
}

export const blogPosts: BlogPost[] = [
  {
    id: 1,
    date: "2026-06-10",
    readTime: "8 min",
    category: "homelab",
    title: "Running k3s on four nodes: what I learned the hard way",
    excerpt:
      "After two failed attempts and one corrupted etcd, I finally have a stable bare-metal k3s cluster. Here's what actually works.",
    featured: true,
  },
  {
    id: 2,
    date: "2026-05-28",
    readTime: "5 min",
    category: "networking",
    title: "Dissecting my home network with nmap and Grafana",
    excerpt: "A weekend project that turned into a permanent dashboard.",
    featured: false,
  },
  {
    id: 3,
    date: "2026-05-12",
    readTime: "11 min",
    category: "homelab",
    title: "Self-hosting everything: six months in",
    excerpt:
      "The services I kept, the ones I dropped, and the one that nearly bricked my NAS.",
    featured: false,
  },
  {
    id: 4,
    date: "2026-04-30",
    readTime: "6 min",
    category: "go",
    title: "Writing a TCP connection pool in Go from scratch",
    excerpt:
      "Because I wanted to understand what database/sql is actually doing under the hood.",
    featured: false,
  },
];
