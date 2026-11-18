
"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Building,
  AlertTriangle,
  ChartNoAxesCombined,
  CircleCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Pencil,
  Plus,
  Receipt,
  ScanLine,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import InstallButton from "./InstallButton";
import BarcodeScanner from "./BarcodeScanner";

const sections = [
  "Dashboard",
  "Point of Sale",
  "Inventory",
  "Barcode Scanner",
  "Customers",
  "Suppliers",
  "Expenses",
  "Reports",
  "Branches",
  "Staff Accounts",
  "Settings",
] as const;

type Section = (typeof sections)[number];

const sectionIcons: Record<Section, LucideIcon> = {
  Dashboard: LayoutDashboard,
  "Point of Sale": ShoppingCart,
  Inventory: Package,
  "Barcode Scanner": ScanLine,
  Customers: Users,
  Suppliers: Truck,
  Expenses: Receipt,
  Reports: ChartNoAxesCombined,
  Branches: Building,
  "Staff Accounts": UserRound,
  Settings,
};

const primarySections: Section[] = [
  "Dashboard",
  "Point of Sale",
  "Inventory",
  "Reports",
];

type Product = {
  id: string;
  name: string;
  price: number;
  costPrice: number;
  stock: number;
  lowStockAt: number;
  barcode: string;
  sku: string;
  imageUrl: string | null;
  description: string | null;
  category: string | null;
  unit: string;
};

type StockMovement = {
  id: string;
  type: string;
  quantity: number;
  note: string | null;
  createdAt: string;
};

type CartItem = Product & { quantity: number };
type PaymentMethod = "CASH" | "GCASH" | "MAYA" | "BANK" | "CARD";

type ReportData = {
  summary: {
    grossSales: number;
    discounts: number;
    transactionCount: number;
    cogs: number;
    expenses: number;
    netProfit: number;
    paymentBreakdown: Record<string, number>;
  };
  expensesList: Array<{
    id: string;
    description: string;
    category?: string | null;
    amount: number;
    createdAt: string;
  }>;
  recentSales: Array<{
    id: string;
    receiptNumber: string;
    total: number;
    createdAt: string;
  }>;
};

async function fetchInventory(): Promise<{
  products: Product[];
  permissions: { canManageStock: boolean; canEditCatalog: boolean };
}> {
  const response = await fetch("/api/inventory");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Unable to load inventory.");
  }

  return {
    products: (data.products || []).map(
      (product: {
        id: string;
        name: string;
        sellingPrice: number;
        costPrice?: number;
        stock: number;
        lowStockAt: number;
        barcode: string | null;
        sku: string | null;
        imageUrl: string | null;
        description: string | null;
        category: string | null;
        unit: string;
      }) => ({
        id: product.id,
        name: product.name,
        price: Number(product.sellingPrice),
        costPrice: Number(product.costPrice ?? 0),
        stock: Number(product.stock),
        lowStockAt: Number(product.lowStockAt),
        barcode: product.barcode || "",
        sku: product.sku || "",
        imageUrl: product.imageUrl,
        description: product.description,
        category: product.category,
        unit: product.unit,
      })
    ),
    permissions: data.permissions || { canManageStock: false, canEditCatalog: false },
  };
}

async function fetchReports(start: string, end: string): Promise<ReportData> {
  const params = new URLSearchParams({ start, end });
  const response = await fetch(`/api/reports?${params.toString()}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Unable to load reports.");
  }

  return data;
}

const peso = (amount: number) =>
  `₱${Number(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const localDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function DashboardClient({
  storeName,
  userName,
}: {
  storeName: string;
  userName: string;
}) {
  const [active, setActive] = useState("Dashboard");
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [canManageInventory, setCanManageInventory] = useState(false);
  const [canEditCatalog, setCanEditCatalog] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [stock, setStock] = useState("");
  const [lowStockAt, setLowStockAt] = useState("5");
  const [barcode, setBarcode] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [imageViewer, setImageViewer] = useState<string | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockDirection, setStockDirection] = useState<"ADD" | "REMOVE">("ADD");
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockReason, setStockReason] = useState("");
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState("");
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("CASH");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [discount, setDiscount] = useState("0");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const [receipt, setReceipt] = useState<{
    receiptNumber: string;
    total: number;
    amountPaid: number;
    change: number;
    balance: number;
  } | null>(null);

  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportStart, setReportStart] = useState(localDate());
  const [reportEnd, setReportEnd] = useState(localDate());

  const loadInventory = useCallback(async () => {
    try {
      setInventoryLoading(true);
      setInventoryError("");
      const inventory = await fetchInventory();
      setProducts(inventory.products);
      setCanManageInventory(inventory.permissions.canManageStock);
      setCanEditCatalog(inventory.permissions.canEditCatalog);
    } catch (error) {
      setInventoryError(
        error instanceof Error ? error.message : "Inventory loading failed."
      );
    } finally {
      setInventoryLoading(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      setReportLoading(true);
      setReportError("");
      setReport(await fetchReports(reportStart, reportEnd));
    } catch (error) {
      setReportError(
        error instanceof Error ? error.message : "Reports loading failed."
      );
    } finally {
      setReportLoading(false);
    }
  }, [reportStart, reportEnd]);

  function navigateToSection(section: Section) {
    if (section === "Reports" && active === "Reports") {
      void loadReports();
    } else {
      if (section === "Reports") setReportLoading(true);
      setActive(section);
    }
    setShowMoreMenu(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialInventory() {
      try {
        const inventory = await fetchInventory();
        if (!cancelled) {
          setProducts(inventory.products);
          setCanManageInventory(inventory.permissions.canManageStock);
          setCanEditCatalog(inventory.permissions.canEditCatalog);
          setInventoryError("");
        }
      } catch (error) {
        if (!cancelled) {
          setInventoryError(
            error instanceof Error ? error.message : "Inventory loading failed."
          );
        }
      } finally {
        if (!cancelled) setInventoryLoading(false);
      }
    }

    void loadInitialInventory();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (active !== "Reports" && active !== "Dashboard") return;

    let cancelled = false;

    async function loadActiveReports() {
      try {
        const data = await fetchReports(reportStart, reportEnd);
        if (!cancelled) {
          setReport(data);
          setReportError("");
        }
      } catch (error) {
        if (!cancelled) {
          setReportError(
            error instanceof Error ? error.message : "Reports loading failed."
          );
        }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    }

    void loadActiveReports();
    return () => {
      cancelled = true;
    };
  }, [active, reportStart, reportEnd]);

  useEffect(() => {
    if (!showMoreMenu) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setShowMoreMenu(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showMoreMenu]);

  function openProductForm(product?: Product) {
    setEditingProductId(product?.id ?? null);
    setName(product?.name ?? "");
    setPrice(product ? String(product.price) : "");
    setCostPrice(product ? String(product.costPrice) : "");
    setStock("");
    setLowStockAt(product ? String(product.lowStockAt) : "5");
    setBarcode(product?.barcode ?? "");
    setSku(product?.sku ?? "");
    setDescription(product?.description ?? "");
    setCategory(product?.category ?? "");
    setUnit(product?.unit ?? "pcs");
    setPhotoFile(null);
    setPhotoPreview(product?.imageUrl ?? "");
    setInventoryError("");
    setShowAdd(true);
  }

  function closeProductForm() {
    if (photoPreview.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setShowAdd(false);
    setEditingProductId(null);
    setPhotoFile(null);
    setPhotoPreview("");
    setInventoryError("");
  }

  async function uploadProductPhoto(productId: string, file: File) {
    const form = new FormData();
    form.set("photo", file);
    const response = await fetch(`/api/inventory/${encodeURIComponent(productId)}/image`, {
      method: "POST",
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to upload product photo.");
  }

  async function removeProductPhoto() {
    if (!editingProductId) return;
    try {
      setSaving(true);
      const response = await fetch(`/api/inventory/${encodeURIComponent(editingProductId)}/image`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to remove product photo.");
      if (photoPreview.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
      setPhotoFile(null);
      setPhotoPreview("");
      await loadInventory();
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : "Unable to remove product photo.");
    } finally {
      setSaving(false);
    }
  }

  async function addProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInventoryError("");

    const editingManagerThresholdOnly = Boolean(editingProductId && !canEditCatalog);
    if (!editingManagerThresholdOnly && (!name.trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isFinite(Number(costPrice)) || Number(costPrice) < 0)) {
      setInventoryError("Enter a product name and valid cost and selling prices.");
      return;
    }
    if (!Number.isFinite(Number(lowStockAt)) || Number(lowStockAt) < 0) {
      setInventoryError("Enter a valid non-negative low-stock threshold.");
      return;
    }
    if (!editingProductId && (!Number.isFinite(Number(stock)) || Number(stock) < 0)) {
      setInventoryError("Enter a valid opening stock quantity.");
      return;
    }

    try {
      setSaving(true);
      let productId = editingProductId;
      const payload = editingManagerThresholdOnly
        ? { lowStockAt: Number(lowStockAt) }
        : {
            name: name.trim(),
            barcode: barcode.trim(),
            sku: sku.trim(),
            description: description.trim(),
            category: category.trim(),
            unit: unit.trim() || "pcs",
            sellingPrice: Number(price),
            costPrice: Number(costPrice),
            lowStockAt: Number(lowStockAt),
            ...(!productId ? { quantity: Number(stock) } : {}),
          };
      const response = await fetch(productId ? `/api/inventory/${encodeURIComponent(productId)}` : "/api/inventory", {
        method: productId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save product.");
      if (!productId) {
        productId = data.product.id as string;
        setEditingProductId(productId);
      }

      if (photoFile && canEditCatalog && productId) {
        try {
          await uploadProductPhoto(productId, photoFile);
        } catch (error) {
          await loadInventory();
          throw new Error(`${error instanceof Error ? error.message : "Photo upload failed."} Product details were saved; retry the photo upload.`);
        }
      }

      await loadInventory();
      closeProductForm();
      setStock("");
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : "Unable to save product.");
    } finally {
      setSaving(false);
    }
  }

  async function openStockDialog(product: Product) {
    setStockProduct(product);
    setStockDirection("ADD");
    setStockQuantity("");
    setStockReason("");
    setStockMovements([]);
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/inventory/${encodeURIComponent(product.id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load stock history.");
      setStockMovements(data.movements || []);
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : "Unable to load stock history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function adjustStock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stockProduct) return;
    if (!Number.isFinite(Number(stockQuantity)) || Number(stockQuantity) <= 0 || stockReason.trim().length < 3) {
      setInventoryError("Enter a positive quantity and a reason with at least three characters.");
      return;
    }
    try {
      setSaving(true);
      setInventoryError("");
      const response = await fetch(`/api/inventory/${encodeURIComponent(stockProduct.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: stockDirection, quantity: Number(stockQuantity), reason: stockReason.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to adjust stock.");
      await loadInventory();
      setStockProduct((current) => current ? { ...current, stock: Number(data.stock), lowStockAt: Number(data.lowStockAt) } : current);
      setStockQuantity("");
      setStockReason("");
      const history = await fetch(`/api/inventory/${encodeURIComponent(stockProduct.id)}`);
      const historyData = await history.json();
      if (history.ok) setStockMovements(historyData.movements || []);
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : "Unable to adjust stock.");
    } finally {
      setSaving(false);
    }
  }

  function addToCart(product: Product): boolean {
    setCheckoutError("");
    setReceipt(null);

    if (product.stock <= 0) {
      setCheckoutError(`${product.name} is out of stock.`);
      return false;
    }

    const existing = cart.find((item) => item.id === product.id);

    if (existing && existing.quantity >= product.stock) {
      setCheckoutError(`Not enough stock for ${product.name}.`);
      return false;
    }

    setCart((current) => {
      const found = current.find((item) => item.id === product.id);

      if (found) {
        return current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { ...product, quantity: 1 }];
    });

    return true;
  }

  function changeQuantity(productId: string, quantity: number) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    if (quantity <= 0) {
      setCart((current) =>
        current.filter((item) => item.id !== productId)
      );
      return;
    }

    if (quantity > product.stock) {
      setCheckoutError(`Only ${product.stock} available in stock.`);
      return;
    }

    setCheckoutError("");
    setCart((current) =>
      current.map((item) =>
        item.id === productId ? { ...item, quantity } : item
      )
    );
  }

  function handleScannedCode(code: string): boolean {
    const normalizedCode = code.trim().toLowerCase();
    if (!normalizedCode) return false;

    const product = products.find(
      (item) =>
        item.barcode.toLowerCase() === normalizedCode ||
        item.sku.toLowerCase() === normalizedCode
    );

    if (product) {
      const added = addToCart(product);
      if (!added) return false;
      setSearch("");
      setCheckoutError("");
      setActive("Point of Sale");
      return true;
    }

    setCheckoutError(`No product found with barcode or SKU: ${code}`);
    return false;
  }

  function findBarcode(): boolean {
    const code = search.trim();
    if (!code) return false;
    return handleScannedCode(code);
  }

  const filteredProducts = products.filter((product) => {
    const term = search.toLowerCase();
    return (
      product.name.toLowerCase().includes(term) ||
      product.barcode.toLowerCase().includes(term) ||
      product.sku.toLowerCase().includes(term)
    );
  });

  const subtotal = Number(
    cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)
  );

  const discountValue = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, Number((subtotal - discountValue).toFixed(2)));
  const lowStockProducts = products.filter((product) => product.stock <= product.lowStockAt);

  async function completeSale() {
    setCheckoutError("");
    setReceipt(null);

    if (cart.length === 0) {
      setCheckoutError("Add products to your cart first.");
      return;
    }

    if (discountValue > subtotal) {
      setCheckoutError("Discount cannot exceed the subtotal.");
      return;
    }

    const amount = Number(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setCheckoutError("Enter a valid payment amount.");
      return;
    }

    if (amount < total) {
      setCheckoutError("Payment is less than the total.");
      return;
    }

    try {
      setCheckoutLoading(true);

      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
          payments: [
            {
              method: paymentMethod,
              amount,
              reference: paymentReference.trim() || undefined,
            },
          ],
          discount: discountValue,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Checkout failed.");
      }

      setReceipt({
        receiptNumber: data.sale.receiptNumber,
        total: Number(data.sale.total),
        amountPaid: Number(data.sale.amountPaid),
        change: Number(data.sale.change),
        balance: Number(data.sale.balance),
      });

      setCart([]);
      setPaymentAmount("");
      setPaymentReference("");
      setDiscount("0");
      setSearch("");

      await loadInventory();
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Checkout failed."
      );
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-[#f4f7f5] text-slate-800">
      <div className="flex min-h-dvh">
        <aside className="hidden w-64 shrink-0 flex-col bg-[#14251f] text-white lg:flex">
          <div className="border-b border-white/10 px-5 py-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500 text-lg font-black">
                KS
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold tracking-wide">KS POS</h1>
                <p className="truncate text-xs text-emerald-200">{storeName}</p>
              </div>
            </div>
          </div>

          <div className="px-4 py-5">
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">
              Main Menu
            </p>
            <nav aria-label="Main navigation" className="space-y-1">
              {sections.map((item) => {
                const Icon = sectionIcons[item];
                return (
                <button
                  key={item}
                  type="button"
                  onClick={() => navigateToSection(item)}
                  aria-current={active === item ? "page" : undefined}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition ${
                    active === item
                      ? "bg-emerald-500 font-semibold text-white shadow-lg shadow-emerald-950/20"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                  {item}
                </button>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto p-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><CircleCheck aria-hidden="true" size={16} className="text-emerald-300" />Connected</p>
              <p className="mt-1 truncate text-xs text-slate-400">{userName}</p>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex min-h-[64px] items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur lg:static lg:min-h-[76px] lg:px-8 lg:py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#14251f] text-sm font-black text-white lg:hidden">
                KS
              </div>
              <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-1 truncate text-[11px] font-semibold text-emerald-700 sm:text-xs">
                <Store aria-hidden="true" size={13} className="shrink-0" />
                {storeName}
              </p>
              <h2 className="truncate text-sm font-bold text-slate-900 sm:text-base lg:text-xl">{active}</h2>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 lg:gap-4">
              <span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 lg:flex">
                <span className="size-2 rounded-full bg-emerald-500" />System online
              </span>
              <div className="hidden lg:block"><InstallButton /></div>
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  aria-label="Log out"
                  className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 lg:bg-red-600 lg:px-4 lg:text-white lg:hover:bg-red-700"
                >
                  <LogOut aria-hidden="true" size={17} />
                  <span className="hidden lg:inline">Logout</span>
                </button>
              </form>
              <div className="hidden size-10 items-center justify-center rounded-full bg-[#14251f] text-sm font-bold text-white lg:flex">
                {userName.slice(0, 1).toUpperCase()}
              </div>
            </div>
          </header>

          <div className="min-w-0 px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pt-5 lg:px-8 lg:pb-8 lg:pt-7">
            {active === "Dashboard" && (
              <>
                <div className="mb-4 flex items-end justify-between gap-3 sm:mb-6">
                  <div>
                    <p className="text-xs font-medium text-slate-500 sm:text-sm">
                      {userName}, here is today at {storeName}.
                    </p>
                    <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Store overview</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateToSection("Point of Sale")}
                    className="hidden min-h-11 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 sm:flex"
                  >
                    <ShoppingCart aria-hidden="true" size={17} />New sale
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
                  {[
                    ["Products", String(products.length), "▤", "Registered products"],
                    [
                      "Low Stock",
                      String(products.filter((p) => p.stock <= 5).length),
                      "!",
                      "Needs attention",
                    ],
                    ["Today's Sales", report ? peso(report.summary.grossSales) : "Open Reports", "↗", "Sales summary"],
                    ["Transactions", report ? String(report.summary.transactionCount) : "Open Reports", "#", "Sales count"],
                  ].map(([label, value, , description]) => (
                    <div
                      key={label}
                      className="h-full min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm sm:p-5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="min-w-0 pr-1 text-xs font-medium text-slate-500 sm:text-sm">{label}</span>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 font-bold text-emerald-700 sm:size-9">
                          {label === "Products" ? <Package aria-hidden="true" size={17} /> : label === "Low Stock" ? <ScanLine aria-hidden="true" size={17} /> : label === "Today's Sales" ? <ChartNoAxesCombined aria-hidden="true" size={17} /> : <Receipt aria-hidden="true" size={17} />}
                        </span>
                      </div>
                      <p className="mt-3 break-words text-[clamp(1rem,4vw,1.5rem)] font-bold leading-tight tracking-tight text-slate-900 sm:mt-4">{value}</p>
                      <p className="mt-1 text-[10px] text-slate-400 sm:text-xs">{description}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-4 sm:mt-6 sm:p-6">
                  <h3 className="font-bold text-slate-900">Quick actions</h3>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-3">
                    <button
                      onClick={() => navigateToSection("Point of Sale")}
                      className="flex min-h-12 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-left text-xs font-semibold text-white sm:px-4 sm:text-sm"
                    >
                      <ShoppingCart aria-hidden="true" size={17} />New sale
                    </button>
                    <button
                      onClick={() => {
                        navigateToSection("Inventory");
                        setShowAdd(true);
                      }}
                      className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 text-left text-xs font-semibold sm:px-4 sm:text-sm"
                    >
                      <Plus aria-hidden="true" size={17} />Add product
                    </button>
                    <button
                      onClick={() => navigateToSection("Reports")}
                      className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 text-left text-xs font-semibold sm:px-4 sm:text-sm"
                    >
                      <ChartNoAxesCombined aria-hidden="true" size={17} />View reports
                    </button>
                  </div>
                </div>
              </>
            )}

            {active === "Point of Sale" && (
              <div className="grid min-w-0 gap-4 xl:grid-cols-5 xl:gap-5">
                <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 xl:col-span-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 sm:text-xl">Product selection</h3>
                      <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                        Search products or scan a barcode.
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                      {products.length} products
                    </span>
                  </div>

                  <div className="mt-4 flex min-w-0 gap-2 sm:mt-5">
                    <div className="relative min-w-0 flex-1">
                      <Search aria-hidden="true" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          findBarcode();
                        }
                      }}
                      placeholder="Search products or scan code"
                      aria-label="Search products by name, barcode, or SKU"
                      className="min-h-12 w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-emerald-500"
                    />
                    </div>
                    <button
                      type="button"
                      onClick={findBarcode}
                      className="min-h-12 shrink-0 rounded-xl bg-[#14251f] px-3 text-sm font-semibold text-white sm:px-4"
                    >
                      Find
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateToSection("Barcode Scanner")}
                      aria-label="Open barcode camera scanner"
                      className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <ScanLine aria-hidden="true" size={18} />
                      <span className="hidden sm:inline">Scan</span>
                    </button>
                  </div>

                  {inventoryLoading ? (
                    <p className="py-12 text-center text-sm text-slate-500">
                      Loading products...
                    </p>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-3 sm:grid-cols-2">
                      {filteredProducts.map((product) => (
                        <button
                          key={product.id}
                          onClick={() => addToCart(product)}
                          disabled={product.stock <= 0}
                          className="min-w-0 rounded-xl border border-slate-200 p-3 text-left transition hover:border-emerald-500 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 sm:p-4"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 sm:size-14">
                              {product.imageUrl ? (
                                <Image src={product.imageUrl} alt={product.name} width={56} height={56} unoptimized className="h-full w-full object-contain" />
                              ) : (
                                <Package aria-hidden="true" size={20} className="text-slate-300" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-xs font-semibold leading-4 text-slate-800 sm:text-sm">{product.name}</p>
                              <p className="mt-1 text-sm font-bold text-emerald-700 sm:text-base">{peso(product.price)}</p>
                            </div>
                          </div>
                          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-500 sm:text-xs">
                            <span>Stock {product.stock}</span>
                            <span className="font-semibold text-emerald-700">Add to cart</span>
                          </div>
                        </button>
                      ))}
                      {filteredProducts.length === 0 && (
                        <p className="col-span-full py-10 text-center text-sm text-slate-400">
                          No matching products found.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div id="pos-cart" className="scroll-mt-24 min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 xl:sticky xl:top-24 xl:col-span-2 xl:self-start">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900 sm:text-xl">Current cart</h3>
                    <button
                      type="button"
                      onClick={() => setCart([])}
                      className="flex min-h-10 items-center rounded-lg px-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Clear cart
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {cart.map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-100 p-3">
                        <div className="flex justify-between gap-2">
                          <div>
                            <p className="font-semibold">{item.name}</p>
                            <p className="text-xs text-slate-500">
                              {peso(item.price)} each
                            </p>
                          </div>
                          <p className="font-bold">
                            {peso(item.price * item.quantity)}
                          </p>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => changeQuantity(item.id, item.quantity - 1)}
                            aria-label={`Decrease ${item.name} quantity`}
                            className="flex size-11 items-center justify-center rounded-xl border border-slate-200 text-lg font-bold"
                          >
                            −
                          </button>
                          <span className="min-w-6 text-center text-sm font-bold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => changeQuantity(item.id, item.quantity + 1)}
                            aria-label={`Increase ${item.name} quantity`}
                            className="flex size-11 items-center justify-center rounded-xl border border-slate-200 text-lg font-bold"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => changeQuantity(item.id, 0)}
                            className="ml-auto min-h-11 rounded-lg px-2 text-xs font-semibold text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    {cart.length === 0 && (
                      <p className="py-8 text-center text-sm text-slate-400">
                        Your cart is empty.
                      </p>
                    )}
                  </div>

                  <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="font-semibold">{peso(subtotal)}</span>
                    </div>

                    <label className="block text-sm">
                      Discount (₱)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                        className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3"
                      />
                    </label>

                    <div className="flex justify-between text-lg font-bold">
                      <span>Total</span>
                      <span className="text-emerald-700">{peso(total)}</span>
                    </div>

                    <label className="block text-sm font-medium">
                      Payment method
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3"
                      >
                        <option value="CASH">Cash</option>
                        <option value="GCASH">GCash</option>
                        <option value="MAYA">Maya</option>
                        <option value="BANK">Bank</option>
                        <option value="CARD">Card</option>
                      </select>
                    </label>

                    <label className="block text-sm font-medium">
                      Amount received (₱)
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder={total.toFixed(2)}
                        className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3"
                      />
                    </label>

                    {paymentMethod !== "CASH" && (
                      <label className="block text-sm font-medium">
                        Payment reference (optional)
                        <input
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder="Transaction reference"
                          className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3"
                        />
                      </label>
                    )}

                    {paymentMethod === "CASH" && Number(paymentAmount) > total && (
                      <div className="flex justify-between rounded-xl bg-emerald-50 p-3 text-sm">
                        <span>Change</span>
                        <strong className="text-emerald-700">
                          {peso(Number(paymentAmount) - total)}
                        </strong>
                      </div>
                    )}

                    {checkoutError && (
                      <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                        {checkoutError}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={completeSale}
                      disabled={checkoutLoading || cart.length === 0}
                      className="min-h-14 w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {checkoutLoading ? "Processing..." : "Complete Sale"}
                    </button>
                  </div>
                </div>

                {receipt && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 xl:col-span-5">
                    <h3 className="text-lg font-bold text-emerald-800">
                      Sale completed successfully!
                    </h3>
                    <p className="mt-2 text-sm">
                      Receipt: <strong>{receipt.receiptNumber}</strong>
                    </p>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                      <p>Total: <strong>{peso(receipt.total)}</strong></p>
                      <p>Paid: <strong>{peso(receipt.amountPaid)}</strong></p>
                      <p>Change: <strong>{peso(receipt.change)}</strong></p>
                      <p>Balance: <strong>{peso(receipt.balance)}</strong></p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReceipt(null)}
                      className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Dismiss receipt
                    </button>
                  </div>
                )}
                <div className="fixed inset-x-3 bottom-[calc(4.7rem+env(safe-area-inset-bottom))] z-30 lg:hidden">
                  <button
                    type="button"
                    onClick={() => document.getElementById("pos-cart")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 shadow-xl shadow-slate-900/10 backdrop-blur"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-left">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                        <ShoppingCart aria-hidden="true" size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-900">Cart · {cart.length} {cart.length === 1 ? "item" : "items"}</span>
                        <span className="block text-[10px] text-slate-500">Tap to review and check out</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-emerald-700">{peso(total)}</span>
                  </button>
                </div>
              </div>
            )}

            {active === "Inventory" && (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 md:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 sm:text-xl">Product inventory</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Manage your store products.
                    </p>
                  </div>
                  {canManageInventory && <button
                    type="button"
                    onClick={() => openProductForm()}
                    className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white"
                  >
                    <Plus aria-hidden="true" size={17} />Add product
                  </button>}
                </div>

                {inventoryLoading && (
                  <p className="mt-4 text-sm text-slate-500">Loading inventory...</p>
                )}

                {inventoryError && (
                  <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    {inventoryError}
                  </p>
                )}

                {!inventoryLoading && lowStockProducts.length > 0 && (
                  <section role="status" aria-label="Low-stock alerts" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                      <AlertTriangle aria-hidden="true" size={18} />
                      {lowStockProducts.length} low-stock {lowStockProducts.length === 1 ? "product" : "products"} in {storeName}
                    </div>
                    <ul className="mt-2 grid gap-1 text-xs text-amber-900 sm:grid-cols-2 lg:grid-cols-3">
                      {lowStockProducts.slice(0, 9).map((product) => (
                        <li key={product.id} className="truncate">{product.name}: {product.stock} {product.unit} left (alert at {product.lowStockAt})</li>
                      ))}
                    </ul>
                    {lowStockProducts.length > 9 && <p className="mt-1 text-xs text-amber-800">And {lowStockProducts.length - 9} more.</p>}
                  </section>
                )}

                {!inventoryLoading && products.length === 0 && (
                  <p className="mt-5 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 lg:hidden">
                    No products yet. Select Add product to begin.
                  </p>
                )}

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:hidden">
                  {products.map((product) => (
                    <article key={product.id} className="flex min-w-0 gap-3 rounded-xl border border-slate-200 p-3">
                      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50">
                        {product.imageUrl ? (
                          <button type="button" onClick={() => setImageViewer(product.imageUrl)} aria-label={`View full photo of ${product.name}`} className="relative h-full w-full">
                            <Image src={product.imageUrl} alt={product.name} fill unoptimized sizes="64px" className="object-contain" />
                          </button>
                        ) : (
                          <Package aria-hidden="true" size={24} className="text-slate-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900">{product.name}</h4>
                        <p className="mt-1 text-sm font-bold text-emerald-700">Sell {peso(product.price)}</p>
                        <p className="text-xs text-slate-500">Cost {peso(product.costPrice)}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
                          <span className={product.stock <= product.lowStockAt ? "font-semibold text-amber-700" : ""}>Stock {product.stock} {product.unit} · alert {product.lowStockAt}</span>
                          {product.barcode && <span className="max-w-full truncate">{product.barcode}</span>}
                        </div>
                        {canManageInventory && <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
                          <button type="button" onClick={() => void openStockDialog(product)} className="min-h-10 flex-1 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-700">Adjust stock / history</button>
                          <button type="button" onClick={() => openProductForm(product)} aria-label={`Edit ${product.name}`} className="flex min-h-10 items-center gap-1 rounded-lg bg-emerald-50 px-3 text-xs font-semibold text-emerald-800"><Pencil aria-hidden="true" size={14} />Edit</button>
                        </div>}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-6 hidden overflow-x-auto lg:block">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="p-3">Product</th>
                        <th className="p-3">Barcode</th>
                        {canManageInventory && <th className="p-3">Cost</th>}
                        <th className="p-3">Selling price</th>
                        <th className="p-3">Stock / alert</th>
                        {canManageInventory && <th className="p-3">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.id} className="border-b border-slate-100">
                          <td className="min-w-56 p-3 font-semibold">
                            <div className="flex items-center gap-3">
                              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
                                {product.imageUrl ? (
                                  <button type="button" onClick={() => setImageViewer(product.imageUrl)} aria-label={`View full photo of ${product.name}`} className="relative h-full w-full">
                                    <Image src={product.imageUrl} alt={product.name} fill unoptimized sizes="48px" className="object-contain" />
                                  </button>
                                ) : (
                                  <Package aria-hidden="true" size={18} className="text-slate-300" />
                                )}
                              </div>
                              <span>{product.name}</span>
                            </div>
                          </td>
                          <td className="p-3">{product.barcode || "—"}</td>
                          {canManageInventory && <td className="p-3">{peso(product.costPrice)}</td>}
                          <td className="p-3">{peso(product.price)}</td>
                          <td className={`p-3 ${product.stock <= product.lowStockAt ? "font-semibold text-amber-800" : ""}`}>{product.stock} {product.unit} / {product.lowStockAt}</td>
                          {canManageInventory && <td className="p-3"><div className="flex gap-2">
                            <button type="button" onClick={() => void openStockDialog(product)} className="min-h-10 rounded-lg border px-3 text-xs font-semibold">Adjust / history</button>
                            <button type="button" onClick={() => openProductForm(product)} aria-label={`Edit ${product.name}`} className="min-h-10 rounded-lg bg-emerald-50 px-3 text-xs font-semibold text-emerald-800">Edit</button>
                          </div></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!inventoryLoading && products.length === 0 && (
                    <p className="py-12 text-center text-sm text-slate-400">
                      No products yet. Select Add Product to begin.
                    </p>
                  )}
                </div>
              </div>
            )}

            {active === "Barcode Scanner" && (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-6">
                <h3 className="text-lg font-bold text-slate-900 sm:text-xl">Barcode scanner</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Scan product labels with your device camera or a connected scanner.
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:mt-5 sm:flex-row">
                  <input
                    autoFocus
                    aria-label="Keyboard barcode or SKU scanner input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        findBarcode();
                      }
                    }}
                    placeholder="Scan barcode or SKU with your scanner"
                    className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-200 p-3 outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      findBarcode();
                    }}
                    className="min-h-12 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white"
                  >
                    Find and add product
                  </button>
                </div>
                {checkoutError && (
                  <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                    {checkoutError}
                  </p>
                )}
                <BarcodeScanner onCodeDetected={handleScannedCode} />
              </div>
            )}

            {active === "Reports" && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">Sales reports</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Sales, discounts, expenses and estimated profit.
                    </p>
                  </div>

                  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-end">
                    <label className="min-w-0 text-xs font-medium sm:text-sm">
                      Start date
                      <input
                        type="date"
                        value={reportStart}
                        onChange={(e) => {
                          setReportLoading(true);
                          setReportStart(e.target.value);
                        }}
                        className="mt-1 block min-h-11 w-full rounded-xl border border-slate-200 p-2 text-sm"
                      />
                    </label>
                    <label className="min-w-0 text-xs font-medium sm:text-sm">
                      End date
                      <input
                        type="date"
                        value={reportEnd}
                        onChange={(e) => {
                          setReportLoading(true);
                          setReportEnd(e.target.value);
                        }}
                        className="mt-1 block min-h-11 w-full rounded-xl border border-slate-200 p-2 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={loadReports}
                      disabled={reportLoading}
                      className="col-span-2 min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-1"
                    >
                      {reportLoading ? "Loading..." : "Refresh"}
                    </button>
                  </div>
                </div>

                {reportError && (
                  <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    {reportError}
                  </p>
                )}

                {reportLoading && (
                  <p className="py-8 text-center text-slate-500">
                    Loading report data...
                  </p>
                )}

                {report && (
                  <>
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-3">
                      {[
                        ["Gross Sales", peso(report.summary.grossSales)],
                        ["Discounts", peso(report.summary.discounts)],
                        ["Transactions", String(report.summary.transactionCount)],
                        ["Cost of Goods Sold", peso(report.summary.cogs)],
                        ["Expenses", peso(report.summary.expenses)],
                        ["Estimated Net Profit", peso(report.summary.netProfit)],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm sm:p-5"
                        >
                          <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
                          <p className="mt-2 break-words text-lg font-bold tracking-tight text-slate-900 sm:mt-3 sm:text-2xl">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5">
                      <h3 className="font-bold text-slate-900">Payment breakdown</h3>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 lg:grid-cols-3">
                        {Object.entries(report.summary.paymentBreakdown || {}).map(
                          ([method, amount]) => (
                            <div key={method} className="min-w-0 rounded-xl bg-slate-50 p-3 sm:p-4">
                              <p className="text-xs text-slate-500 sm:text-sm">{method}</p>
                              <p className="mt-1 break-words text-sm font-bold sm:text-lg">
                                {peso(Number(amount))}
                              </p>
                            </div>
                          )
                        )}
                        {Object.keys(report.summary.paymentBreakdown || {}).length === 0 && (
                          <p className="text-sm text-slate-400">
                            No payment records for this period.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5">
                      <h3 className="font-bold text-slate-900">Recent sales</h3>
                      <div className="mt-3 space-y-2 lg:hidden">
                        {report.recentSales.map((sale) => (
                          <article key={sale.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-900">{sale.receiptNumber}</p>
                              <p className="mt-1 text-[10px] text-slate-500">{new Date(sale.createdAt).toLocaleString("en-PH")}</p>
                            </div>
                            <p className="shrink-0 text-sm font-bold text-slate-900">{peso(Number(sale.total))}</p>
                          </article>
                        ))}
                        {report.recentSales.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">No sales for this date range.</p>}
                      </div>
                      <div className="mt-4 hidden overflow-x-auto lg:block">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                              <th className="p-3">Receipt</th>
                              <th className="p-3">Date</th>
                              <th className="p-3 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.recentSales.map((sale) => (
                              <tr key={sale.id} className="border-b border-slate-100">
                                <td className="p-3 font-semibold">
                                  {sale.receiptNumber}
                                </td>
                                <td className="p-3">
                                  {new Date(sale.createdAt).toLocaleString("en-PH")}
                                </td>
                                <td className="p-3 text-right font-semibold">
                                  {peso(Number(sale.total))}
                                </td>
                              </tr>
                            ))}
                            {report.recentSales.length === 0 && (
                              <tr>
                                <td colSpan={3} className="p-6 text-center text-slate-400">
                                  No sales for this date range.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5">
                      <h3 className="font-bold text-slate-900">Expenses in selected period</h3>
                      <div className="mt-3 space-y-2 lg:hidden">
                        {report.expensesList.map((expense) => (
                          <article key={expense.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-xs font-semibold text-slate-900">{expense.description}</p>
                              <p className="mt-1 truncate text-[10px] text-slate-500">{expense.category || "Uncategorized"} · {new Date(expense.createdAt).toLocaleDateString("en-PH")}</p>
                            </div>
                            <p className="shrink-0 text-sm font-bold text-slate-900">{peso(Number(expense.amount))}</p>
                          </article>
                        ))}
                        {report.expensesList.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">No expenses for this date range.</p>}
                      </div>
                      <div className="mt-4 hidden overflow-x-auto lg:block">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                              <th className="p-3">Description</th>
                              <th className="p-3">Category</th>
                              <th className="p-3">Date</th>
                              <th className="p-3 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.expensesList.map((expense) => (
                              <tr key={expense.id} className="border-b border-slate-100">
                                <td className="p-3 font-semibold">{expense.description}</td>
                                <td className="p-3">{expense.category || "—"}</td>
                                <td className="p-3">
                                  {new Date(expense.createdAt).toLocaleDateString("en-PH")}
                                </td>
                                <td className="p-3 text-right">
                                  {peso(Number(expense.amount))}
                                </td>
                              </tr>
                            ))}
                            {report.expensesList.length === 0 && (
                              <tr>
                                <td colSpan={4} className="p-6 text-center text-slate-400">
                                  No expenses for this date range.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}

                {!report && !reportLoading && !reportError && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                    Select a date range to view your reports.
                  </div>
                )}
              </div>
            )}

            {active !== "Dashboard" &&
              active !== "Inventory" &&
              active !== "Point of Sale" &&
              active !== "Barcode Scanner" &&
              active !== "Reports" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-8">
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
                    KS POS Module
                  </p>
                  <h3 className="mt-2 text-2xl font-bold">{active}</h3>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
                    This module still needs its database operations and interface implementation.
                  </p>
                </div>
              )}
          </div>
        </section>
      </div>

      {showMoreMenu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close more menu"
            onClick={() => setShowMoreMenu(false)}
            className="absolute inset-0 bg-slate-950/30"
          />
          <section
            id="more-sections-menu"
            role="dialog"
            aria-modal="true"
            aria-label="More sections"
            className="absolute inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] max-h-[70dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:left-auto sm:right-4 sm:w-80"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">More sections</p>
                <h3 className="mt-1 font-bold text-slate-900">{storeName}</h3>
              </div>
              <button
                type="button"
                aria-label="Close more menu"
                onClick={() => setShowMoreMenu(false)}
                className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X aria-hidden="true" size={19} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {sections.filter((item) => !primarySections.includes(item)).map((item) => {
                const Icon = sectionIcons[item];
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => navigateToSection(item)}
                    className={`flex min-h-12 min-w-0 items-center gap-2 rounded-xl border px-3 text-left text-xs font-semibold ${
                      active === item
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <Icon aria-hidden="true" size={17} className="shrink-0" />
                    <span className="truncate">{item}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <InstallButton />
            </div>
          </section>
        </div>
      )}

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-1 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden"
      >
        {primarySections.map((item) => {
          const Icon = sectionIcons[item];
          const selected = active === item;
          const label = item === "Point of Sale" ? "POS" : item;

          return (
            <button
              key={item}
              type="button"
              onClick={() => navigateToSection(item)}
              aria-current={selected ? "page" : undefined}
              className={`relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold leading-none transition ${
                selected ? "text-emerald-700" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <span className={`flex size-7 items-center justify-center rounded-lg ${selected ? "bg-emerald-50" : ""}`}>
                <Icon aria-hidden="true" size={19} strokeWidth={selected ? 2.3 : 1.8} />
              </span>
              <span className="max-w-full truncate">{label}</span>
              {item === "Point of Sale" && cart.length > 0 && (
                <span className="absolute right-1/2 top-0 translate-x-4 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] leading-none text-white">
                  {cart.length}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setShowMoreMenu((open) => !open)}
          aria-expanded={showMoreMenu}
          aria-controls={showMoreMenu ? "more-sections-menu" : undefined}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold leading-none ${
            !primarySections.includes(active as Section) || showMoreMenu
              ? "text-emerald-700"
              : "text-slate-500"
          }`}
        >
          <span className={`flex size-7 items-center justify-center rounded-lg ${!primarySections.includes(active as Section) || showMoreMenu ? "bg-emerald-50" : ""}`}>
            {showMoreMenu ? <X aria-hidden="true" size={19} /> : <Menu aria-hidden="true" size={19} />}
          </span>
          <span>More</span>
        </button>
      </nav>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex overflow-y-auto overscroll-contain bg-slate-950/50 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:items-center sm:p-5">
          <form
            onSubmit={addProduct}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-product-title"
            className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 shadow-2xl sm:p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 id="add-product-title" className="text-lg font-bold text-slate-900 sm:text-xl">{editingProductId ? "Edit product" : "Add product"}</h3>
                {editingProductId && !canEditCatalog && <p className="mt-1 text-xs text-slate-500">Managers can change this branch’s alert threshold. Shared product details are owner-managed.</p>}
              </div>
              <button
                type="button"
                onClick={closeProductForm}
                aria-label="Close product form"
                className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X aria-hidden="true" size={19} />
              </button>
            </div>

            <div className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
              <label className="block text-sm font-medium">
                Product name
                <input
                  required
                  maxLength={120}
                  disabled={Boolean(editingProductId && !canEditCatalog)}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3 text-base"
                  placeholder="Enter product name"
                />
              </label>

              <label className="block text-sm font-medium">
                Barcode
                <input
                  maxLength={128}
                  disabled={Boolean(editingProductId && !canEditCatalog)}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3 text-base"
                  placeholder="Optional barcode"
                />
              </label>

              <label className="block text-sm font-medium">
                SKU
                <input
                  maxLength={64}
                  disabled={Boolean(editingProductId && !canEditCatalog)}
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3 text-base"
                  placeholder="Optional product SKU"
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Selling price (₱)
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    max="9999999999.99"
                    disabled={Boolean(editingProductId && !canEditCatalog)}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3 text-base"
                  />
                </label>

                {!editingProductId && <label className="block text-sm font-medium">
                  Opening stock
                  <input
                    required
                    type="number"
                    min="0"
                    max="999999999.999"
                    step="0.001"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3 text-base"
                  />
                </label>}
              </div>
              <label className="block text-sm font-medium">
                Cost price (₱)
                <input required type="number" min="0" max="9999999999.99" step="0.01" disabled={Boolean(editingProductId && !canEditCatalog)} value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3 text-base disabled:bg-slate-100" />
              </label>
              <label className="block text-sm font-medium">
                Low-stock alert at
                <input required type="number" min="0" max="999999999.999" step="0.001" value={lowStockAt} onChange={(e) => setLowStockAt(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3 text-base" />
              </label>
              {(!editingProductId || canEditCatalog) && <>
                <label className="block text-sm font-medium">
                  Category
                  <input maxLength={80} value={category} onChange={(e) => setCategory(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3 text-base" />
                </label>
                <label className="block text-sm font-medium">
                  Unit
                  <input required maxLength={20} value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3 text-base" placeholder="pcs, kg, bottle" />
                </label>
                <label className="block text-sm font-medium sm:col-span-2">
                  Description
                  <textarea maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-base" />
                </label>
                {canEditCatalog && <div className="sm:col-span-2">
                  <label className="block text-sm font-medium">
                    Product photo (JPEG, PNG or WebP; up to 5 MB)
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (file && file.size > 5 * 1024 * 1024) {
                        setInventoryError("Photo must be 5 MB or smaller.");
                        event.target.value = "";
                        return;
                      }
                      if (photoPreview.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
                      setPhotoFile(file);
                      setPhotoPreview(file ? URL.createObjectURL(file) : editingProductId ? products.find((product) => product.id === editingProductId)?.imageUrl ?? "" : "");
                      setInventoryError("");
                    }} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-200 p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:font-semibold file:text-emerald-800" />
                  </label>
                  {photoPreview && <div className="mt-3 flex items-center gap-3">
                    <button type="button" onClick={() => setImageViewer(photoPreview)} className="relative h-28 w-28 overflow-hidden rounded-xl border border-slate-200 bg-slate-50" aria-label="Preview full product photo">
                      <Image src={photoPreview} alt="Product photo preview" fill unoptimized sizes="112px" className="object-contain" />
                    </button>
                    {editingProductId && !photoFile && <button type="button" disabled={saving} onClick={() => void removeProductPhoto()} className="min-h-10 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 disabled:opacity-50">Remove photo</button>}
                  </div>}
                </div>}
              </>}
            </div>

            {inventoryError && (
              <p className="mt-3 text-sm text-red-600">{inventoryError}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-5 min-h-12 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50 sm:mt-6"
            >
              {saving ? "Saving..." : editingProductId ? "Save changes" : "Save product"}
            </button>
          </form>
        </div>
      )}

      {stockProduct && (
        <div className="fixed inset-0 z-50 flex overflow-y-auto overscroll-contain bg-slate-950/50 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:items-center sm:p-5">
          <section role="dialog" aria-modal="true" aria-labelledby="stock-dialog-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="stock-dialog-title" className="text-lg font-bold text-slate-900 sm:text-xl">Stock adjustment</h3>
                <p className="mt-1 truncate text-sm text-slate-600">{stockProduct.name} · {stockProduct.stock} {stockProduct.unit} in {storeName}</p>
              </div>
              <button type="button" onClick={() => setStockProduct(null)} aria-label="Close stock adjustment" className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X aria-hidden="true" size={19} /></button>
            </div>

            <form onSubmit={adjustStock} className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Adjustment
                <select value={stockDirection} onChange={(event) => setStockDirection(event.target.value as "ADD" | "REMOVE")} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3">
                  <option value="ADD">Add stock</option>
                  <option value="REMOVE">Remove stock</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                Quantity ({stockProduct.unit})
                <input required type="number" min="0.001" max="999999999.999" step="0.001" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3" />
              </label>
              <label className="block text-sm font-medium sm:col-span-2">
                Reason
                <input required minLength={3} maxLength={240} value={stockReason} onChange={(event) => setStockReason(event.target.value)} placeholder="For example: damaged goods, count correction, delivery" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3" />
              </label>
              {inventoryError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{inventoryError}</p>}
              <button type="submit" disabled={saving} className="min-h-12 rounded-xl bg-emerald-600 px-4 font-semibold text-white disabled:opacity-50 sm:col-span-2">{saving ? "Saving adjustment…" : "Save stock adjustment"}</button>
            </form>

            <div className="mt-6 border-t border-slate-200 pt-4">
              <h4 className="font-bold text-slate-900">Recent stock history</h4>
              {historyLoading ? <p className="mt-3 text-sm text-slate-500">Loading history…</p> : stockMovements.length === 0 ? <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No branch stock movements recorded yet.</p> : (
                <ol className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                  {stockMovements.map((movement) => (
                    <li key={movement.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-xl bg-slate-50 p-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800">{movement.type.replaceAll("_", " ")}: {movement.note || "No reason recorded"}</p>
                        <p className="mt-1 text-xs text-slate-500">{new Date(movement.createdAt).toLocaleString("en-PH")}</p>
                      </div>
                      <span className={`font-bold ${movement.type === "ADJUSTMENT" && movement.quantity < 0 ? "text-red-700" : "text-slate-800"}`}>{movement.type === "ADJUSTMENT" && movement.quantity > 0 ? "+" : ""}{movement.quantity} {stockProduct.unit}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>
      )}

      {imageViewer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:p-8" onClick={() => setImageViewer(null)}>
          <button type="button" onClick={() => setImageViewer(null)} aria-label="Close full product photo" className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-10 flex size-11 items-center justify-center rounded-full bg-white/15 text-white"><X aria-hidden="true" size={22} /></button>
          <div className="relative h-full max-h-[90dvh] w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <Image src={imageViewer} alt="Full-size product" fill unoptimized sizes="100vw" className="object-contain" />
          </div>
        </div>
      )}
    </main>
  );
}
