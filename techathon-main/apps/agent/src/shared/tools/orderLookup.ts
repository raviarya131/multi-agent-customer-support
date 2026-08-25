/**
 * shared/tools/orderLookup.ts
 *
 * Shared tool: look up a customer's recent e-commerce orders (status, tracking,
 * items, ETA). Mocked here so the pipeline runs end to end; a real system would
 * query the order-management service. Used by the `orders` specialist.
 */
import type { Tool } from "../core/types.js";

interface OrderItem {
  name: string;
  qty: number;
}
interface OrderRecord {
  orderId: string;
  status: "processing" | "shipped" | "out_for_delivery" | "delivered" | "delayed" | "cancelled";
  placedOn: string;
  eta: string | null;
  carrier: string | null;
  tracking: string | null;
  items: OrderItem[];
  total: number;
  cancellable: boolean;
}

// Recent orders keyed by customerId (aligns with the other mock tools).
const MOCK_ORDERS: Record<string, OrderRecord[]> = {
  cust_001: [
    {
      orderId: "ORD-1001",
      status: "out_for_delivery",
      placedOn: "2026-06-22",
      eta: "2026-06-27",
      carrier: "BlueDart",
      tracking: "BD123456789IN",
      items: [{ name: "Wireless Earbuds Pro", qty: 1 }],
      total: 4999,
      cancellable: false,
    },
  ],
  cust_002: [
    {
      orderId: "ORD-1002",
      status: "delayed",
      placedOn: "2026-06-18",
      eta: "2026-06-29",
      carrier: "Delhivery",
      tracking: "DL987654321IN",
      items: [{ name: "Cotton T-Shirt (M)", qty: 2 }],
      total: 1198,
      cancellable: false,
    },
  ],
  cust_003: [
    {
      orderId: "ORD-1003",
      status: "processing",
      placedOn: "2026-06-26",
      eta: "2026-07-01",
      carrier: null,
      tracking: null,
      items: [{ name: "Stainless Steel Water Bottle", qty: 1 }],
      total: 899,
      cancellable: true,
    },
  ],
  cust_005: [
    {
      orderId: "ORD-1005",
      status: "delivered",
      placedOn: "2026-06-10",
      eta: "2026-06-14",
      carrier: "BlueDart",
      tracking: "BD555000111IN",
      items: [{ name: "Running Shoes (UK 9)", qty: 1 }],
      total: 3499,
      cancellable: false,
    },
  ],
  cust_007: [
    {
      orderId: "ORD-1007",
      status: "shipped",
      placedOn: "2026-06-24",
      eta: "2026-06-28",
      carrier: "Delhivery",
      tracking: "DL222333444IN",
      items: [{ name: "Mechanical Keyboard", qty: 1 }, { name: "Mouse Pad XL", qty: 1 }],
      total: 6499,
      cancellable: false,
    },
  ],
};

export const orderLookup: Tool = {
  name: "orderLookup",
  description:
    "Look up a customer's recent orders (status, tracking, items, ETA). args: { customerId, orderId? }. Returns { found, orders }.",
  async run(args: Record<string, unknown>): Promise<unknown> {
    const customerId = String(args.customerId ?? "");
    const orderId = args.orderId ? String(args.orderId) : "";
    const all = MOCK_ORDERS[customerId] ?? [];
    const orders = orderId ? all.filter((o) => o.orderId.toLowerCase() === orderId.toLowerCase()) : all;
    return { found: orders.length > 0, customerId: customerId || null, orders };
  },
};
