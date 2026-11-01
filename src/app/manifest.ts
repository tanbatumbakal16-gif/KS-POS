
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KS POS - Store Management System",
    short_name: "KS POS",
    description: "Complete Sari-Sari Store Point of Sale System",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6fa",
    theme_color: "#14251f",
    orientation: "any",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
