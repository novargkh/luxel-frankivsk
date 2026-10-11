export type ReturnStatus = "NEW" | "APPROVED" | "REJECTED" | "COMPLETED";

export type ReturnRequestDto = {
  id: string;
  reason: string;
  status: ReturnStatus;
  adminComment: string | null;
  createdAt: string;
  user?: { name: string; email: string; company: string | null };
  items: {
    id: string;
    orderItemId: string;
    quantity: number;
    orderNumber: string | null;
    orderItem: {
      quantity: number;
      priceAtOrder: number;
      product: { id: string; name: string; article: string | null; images: { url: string }[] };
    };
  }[];
};

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  NEW: "На розгляді",
  APPROVED: "Погоджено",
  REJECTED: "Відхилено",
  COMPLETED: "Завершено",
};

export const RETURN_STATUS_COLORS: Record<ReturnStatus, string> = {
  NEW: "bg-amber-100/80 text-amber-800",
  APPROVED: "bg-blue-100/80 text-blue-800",
  REJECTED: "bg-black/[0.06] text-muted",
  COMPLETED: "bg-emerald-100/80 text-emerald-800",
};
