import type { Metadata } from "next";

import { OrbMotionLab } from "@/features/presence/components/orb-motion-lab";

export const metadata: Metadata = {
  title: "Orb Motion Lab — MASIL",
  description: "MASIL Orb의 화면별 유체 동작을 한곳에서 확인하는 QA 화면",
};

export default function OrbLabPage() {
  return <OrbMotionLab />;
}
