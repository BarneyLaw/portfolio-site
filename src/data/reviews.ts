export type ReviewType = "HARDWARE" | "SOFTWARE";
export type Verdict = "RECOMMENDED" | "MIXED" | "PASS";

export interface Review {
  id: number;
  type: ReviewType;
  verdict: Verdict;
  name: string;
  date: string;
  excerpt: string;
}

export const reviews: Review[] = [
  {
    id: 1,
    type: "HARDWARE",
    verdict: "RECOMMENDED",
    name: "MikroTik RB5009UG+S+IN",
    date: "2026-06-01",
    excerpt:
      "The best sub-$200 router I've owned. RouterOS has a steep learning curve but the hardware is rock-solid and the feature set is absurd for the price.",
  },
  {
    id: 2,
    type: "SOFTWARE",
    verdict: "MIXED",
    name: "Tailscale",
    date: "2026-05-15",
    excerpt:
      "Great for what it is, but the free tier limits sting and I'd rather self-host Headscale. Setup was effortless though.",
  },
  {
    id: 3,
    type: "HARDWARE",
    verdict: "PASS",
    name: "TP-Link EAP670",
    date: "2026-04-20",
    excerpt:
      "Fine specs on paper but the Omada controller software is a mess and the hardware runs warm. Returned it after a week.",
  },
  {
    id: 4,
    type: "SOFTWARE",
    verdict: "RECOMMENDED",
    name: "Proxmox VE",
    date: "2026-03-10",
    excerpt:
      "The virtualization platform I should have switched to years ago. Web UI is functional, clustering works, and the community is excellent.",
  },
];
