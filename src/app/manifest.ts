import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Haeday · Korean saju", short_name: "Haeday", start_url: "/", display: "standalone",
    background_color: "#12132A", theme_color: "#12132A", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
