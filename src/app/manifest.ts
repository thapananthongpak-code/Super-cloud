import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ห้องฝากไฟล์",
    short_name: "ฝากไฟล์",
    description: "ฝากไฟล์ให้เพื่อนและครอบครัว โหลดได้จากทุกเครื่อง",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fff8f0",
    theme_color: "#e8692b",
    lang: "th",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
