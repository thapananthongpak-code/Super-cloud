import type { Metadata } from "next";
import { AdminPanel } from "@/components/AdminPanel";

export const metadata: Metadata = {
  title: "ผู้ดูแล · ห้องฝากไฟล์",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminPanel />;
}
