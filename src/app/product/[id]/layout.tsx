import type { ReactNode } from "react";
import { getProductSocialMetadata } from "@/lib/server/product-social-metadata";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return getProductSocialMetadata((await params).id);
}
export default function ProductLayout({ children }: { children: ReactNode }) {
  return children;
}
