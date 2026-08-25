/**
 * shared/tools/productLookup.ts
 *
 * Shared tool: look up product catalog details (price, availability, specs).
 * Mocked here so the pipeline runs end to end; a real system would query the
 * catalog/inventory service. Used by the `products` specialist.
 */
import type { Tool } from "../core/types.js";

interface ProductRecord {
  productId: string;
  name: string;
  price: number;
  currency: string;
  inStock: boolean;
  stockCount: number;
  variants: string[];
  restockEta: string | null;
  specs: Record<string, string>;
}

const CATALOG: ProductRecord[] = [
  {
    productId: "SKU-EARBUDS",
    name: "Wireless Earbuds Pro",
    price: 4999,
    currency: "INR",
    inStock: true,
    stockCount: 42,
    variants: ["Black", "White"],
    restockEta: null,
    specs: { battery: "8h + 24h case", anc: "yes", warranty: "1 year" },
  },
  {
    productId: "SKU-TSHIRT",
    name: "Cotton T-Shirt",
    price: 599,
    currency: "INR",
    inStock: true,
    stockCount: 130,
    variants: ["S", "M", "L", "XL"],
    restockEta: null,
    specs: { material: "100% cotton", fit: "regular", care: "machine wash" },
  },
  {
    productId: "SKU-SHOES",
    name: "Running Shoes",
    price: 3499,
    currency: "INR",
    inStock: false,
    stockCount: 0,
    variants: ["UK 7", "UK 8", "UK 9", "UK 10"],
    restockEta: "2026-07-05",
    specs: { type: "neutral", drop: "8mm", weight: "240g" },
  },
  {
    productId: "SKU-KEYBOARD",
    name: "Mechanical Keyboard",
    price: 5999,
    currency: "INR",
    inStock: true,
    stockCount: 7,
    variants: ["Blue switch", "Brown switch", "Red switch"],
    restockEta: null,
    specs: { layout: "TKL", backlight: "RGB", warranty: "2 years" },
  },
  {
    productId: "SKU-BOTTLE",
    name: "Stainless Steel Water Bottle",
    price: 899,
    currency: "INR",
    inStock: true,
    stockCount: 88,
    variants: ["500ml", "750ml", "1L"],
    restockEta: null,
    specs: { insulation: "24h cold / 12h hot", material: "18/8 steel" },
  },
];

function matches(p: ProductRecord, q: string): boolean {
  const hay = `${p.productId} ${p.name} ${p.variants.join(" ")}`.toLowerCase();
  return q.split(/\s+/).filter(Boolean).some((term) => hay.includes(term));
}

export const productLookup: Tool = {
  name: "productLookup",
  description:
    "Look up product catalog details (price, availability, stock, variants, specs). args: { query? , productId? }. Returns { found, products }.",
  async run(args: Record<string, unknown>): Promise<unknown> {
    const productId = args.productId ? String(args.productId).toLowerCase() : "";
    const query = String(args.query ?? "").toLowerCase().trim();
    let products: ProductRecord[];
    if (productId) {
      products = CATALOG.filter((p) => p.productId.toLowerCase() === productId);
    } else if (query) {
      products = CATALOG.filter((p) => matches(p, query));
    } else {
      products = CATALOG;
    }
    return { found: products.length > 0, products };
  },
};
