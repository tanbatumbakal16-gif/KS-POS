
"use client";

import { useEffect, useState } from "react";
import InstallButton from "./InstallButton";

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
];

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  barcode: string;
};

type CartItem = Product & {
  quantity: number;
};

type PaymentMethod = "CASH" | "GCASH" | "MAYA" | "BANK" | "CARD";

const peso = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function DashboardClient() {
  const [active, setActive] = useState("Dashboard");
  const [products, setProducts] = useState<Product[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [barcode, setBarcode] = useState("");

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

  async function loadInventory() {
    try {
      setInventoryLoading(true);
      setInventoryError("");

      const response = await fetch("/api/inventory");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load inventory.");
      }

      setProducts(
        (data.products || []).map(
          (product: {
            id: string;
            name: string;
            sellingPrice: number;
            stock: number;
            barcode: string | null;
          }) => ({
            id: product.id,
            name: product.name,
            price: Number(product.sellingPrice),
            stock: Number(product.stock),
            barcode: product.barcode || "",
          })
        )
      );
    } catch (error) {
      setInventoryError(
        error instanceof Error
          ? error.message
          : "Inventory loading failed."
      );
    } finally {
      setInventoryLoading(false);
    }
  }

  useEffect(() => {
    loadInventory();
  }, []);

  async function addProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInventoryError("");

    if (
      !name.trim() ||
      !Number.isFinite(Number(price)) ||
      Number(price) < 0 ||
      !Number.isFinite(Number(stock)) ||
      Number(stock) < 0
    ) {
      setInventoryError("Please enter valid product details.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          barcode: barcode.trim(),
          sellingPrice: Number(price),
          costPrice: 0,
          quantity: Number(stock),
          lowStockAt: 5,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save product.");
      }

      await loadInventory();

      setName("");
      setPrice("");
      setStock("");
      setBarcode("");
      setShowAdd(false);
    } catch (error) {
      setInventoryError(
        error instanceof Error
          ? error.message
          : "Unable to save product."
      );
    } finally {
      setSaving(false);
    }
  }

  function addToCart(product: Product) {
    setCheckoutError("");
    setReceipt(null);

    if (product.stock <= 0) {
      setCheckoutError(`${product.name} is out of stock.`);
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);

      if (existing) {
        if (existing.quantity >= product.stock) {
          setCheckoutError(`Not enough stock for ${product.name}.`);
          return current;
        }

        return current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { ...product, quantity: 1 }];
    });
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

  function findBarcode() {
    const code = search.trim();

    if (!code) return;

    const product = products.find(
      (item) => item.barcode.toLowerCase() === code.toLowerCase()
    );

    if (product) {
      addToCart(product);
      setSearch("");
    } else {
      setCheckoutError(`No product found with barcode: ${code}`);
    }
  }

  const filteredProducts = products.filter((product) => {
    const term = search.toLowerCase();

    return (
      product.name.toLowerCase().includes(term) ||
      product.barcode.toLowerCase().includes(term)
    );
  });

  const subtotal = Number(
    cart
      .reduce((sum, item) => sum + item.price * item.quantity, 0)
      .toFixed(2)
  );

  const discountValue = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, Number((subtotal - discountValue).toFixed(2)));

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
      setCheckoutError(
        "Payment is less than the total. This screen currently requires full payment."
      );
      return;
    }

    try {
      setCheckoutLoading(true);

      const response = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
        total: data.sale.total,
        amountPaid: data.sale.amountPaid,
        change: data.sale.change,
        balance: data.sale.balance,
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
    <main className="min-h-screen bg-[#f5f6fa] text-slate-800">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col bg-[#14251f] text-white md:flex">
          <div className="border-b border-white/10 px-6 py-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-xl font-black">
                KS
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-wide">KS POS</h1>
                <p className="text-xs text-emerald-200">
                  Store Management System
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 py-5">
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">
              Main Menu
            </p>
            <nav className="space-y-1">
              {sections.map((item, index) => (
                <button
                  key={item}
                  onClick={() => setActive(item)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                    active === item
                      ? "bg-emerald-500 font-semibold text-white shadow-lg"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <span className="w-6 text-center">
                    {["▦", "▣", "▤", "▥", "♙", "♧", "₱", "▥", "⌂", "♟", "⚙"][index]}
                  </span>
                  {item}
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-auto p-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold">KS POS</p>
              <p className="mt-1 text-xs text-slate-400">
                Cloud-ready store system
              </p>
              <p className="mt-3 text-[10px] text-emerald-300">
                ● Local preview
              </p>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 md:px-8">
            <div>
              <p className="text-xs text-slate-400">
                KS POS / Store Management
              </p>
              <h2 className="text-xl font-bold">{active}</h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                ● System online
              </span>
              <InstallButton />
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Logout
                </button>
              </form>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#14251f] font-bold text-white">
                KS
              </div>
            </div>
          </header>

          <div className="p-5 md:p-8">
            {active === "Dashboard" && (
              <>
                <div className="mb-7">
                  <p className="text-sm text-slate-500">
                    Welcome to your store management workspace.
                  </p>
                  <h3 className="mt-1 text-2xl font-bold">
                    Store Overview
                  </h3>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Today's Sales", "₱0.00", "↗", "Sales summary pending"],
                    ["Transactions", "0", "#", "Today's orders"],
                    ["Products", String(products.length), "▤", "Registered products"],
                    [
                      "Low Stock",
                      String(products.filter((p) => p.stock <= 5).length),
                      "!",
                      "Needs attention",
                    ],
                  ].map(([label, value, icon, description]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">{label}</span>
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 font-bold text-emerald-700">
                          {icon}
                        </span>
                      </div>
                      <p className="mt-4 text-3xl font-bold">{value}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {description}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-7 grid gap-5 xl:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 xl:col-span-2">
                    <h3 className="font-bold">Sales Activity</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Sales chart will appear when transaction reports are implemented.
                    </p>
                    <div className="flex h-52 flex-col items-center justify-center text-center">
                      <span className="text-4xl text-slate-300">▥</span>
                      <p className="mt-3 text-sm font-semibold text-slate-500">
                        Sales chart pending
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-6">
                    <h3 className="font-bold">Quick Actions</h3>
                    <div className="mt-5 space-y-3">
                      <button
                        onClick={() => setActive("Point of Sale")}
                        className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-left text-sm font-semibold text-white"
                      >
                        ＋ New Sale
                      </button>
                      <button
                        onClick={() => {
                          setActive("Inventory");
                          setShowAdd(true);
                        }}
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold"
                      >
                        ＋ Add Product
                      </button>
                      <button
                        onClick={() => setActive("Reports")}
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold"
                      >
                        ▤ View Reports
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {active === "Point of Sale" && (
              <div className="grid gap-5 xl:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 xl:col-span-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-bold">Product Selection</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Search products or scan a barcode.
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                      {products.length} products
                    </span>
                  </div>

                  <div className="mt-5 flex gap-2">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          findBarcode();
                        }
                      }}
                      placeholder="Search product or scan barcode..."
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 p-3 outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={findBarcode}
                      className="rounded-xl bg-[#14251f] px-4 py-3 text-sm font-semibold text-white"
                    >
                      Find
                    </button>
                  </div>

                  {inventoryLoading ? (
                    <p className="py-12 text-center text-sm text-slate-500">
                      Loading products...
                    </p>
                  ) : (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {filteredProducts.map((product) => (
                        <button
                          key={product.id}
                          onClick={() => addToCart(product)}
                          disabled={product.stock <= 0}
                          className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-emerald-500 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <p className="font-semibold">{product.name}</p>
                          <p className="mt-2 text-lg font-bold text-emerald-700">
                            {peso(product.price)}
                          </p>
                          <div className="mt-2 flex justify-between text-xs text-slate-500">
                            <span>Stock: {product.stock}</span>
                            <span>{product.barcode || "No barcode"}</span>
                          </div>
                          <p className="mt-3 text-xs font-semibold text-emerald-700">
                            + Add to cart
                          </p>
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

                <div className="rounded-2xl border border-slate-200 bg-white p-5 xl:col-span-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">Current Cart</h3>
                    <button
                      onClick={() => setCart([])}
                      className="text-xs font-semibold text-red-600"
                    >
                      Clear cart
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {cart.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-100 p-3"
                      >
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
                            onClick={() =>
                              changeQuantity(item.id, item.quantity - 1)
                            }
                            className="h-8 w-8 rounded-lg border border-slate-200 font-bold"
                          >
                            −
                          </button>
                          <span className="min-w-6 text-center text-sm font-bold">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              changeQuantity(item.id, item.quantity + 1)
                            }
                            className="h-8 w-8 rounded-lg border border-slate-200 font-bold"
                          >
                            +
                          </button>
                          <button
                            onClick={() => changeQuantity(item.id, 0)}
                            className="ml-auto text-xs font-semibold text-red-600"
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
                        className="mt-2 w-full rounded-xl border border-slate-200 p-3"
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
                        onChange={(e) =>
                          setPaymentMethod(e.target.value as PaymentMethod)
                        }
                        className="mt-2 w-full rounded-xl border border-slate-200 p-3"
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
                        className="mt-2 w-full rounded-xl border border-slate-200 p-3"
                      />
                    </label>

                    {paymentMethod !== "CASH" && (
                      <label className="block text-sm font-medium">
                        Payment reference (optional)
                        <input
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder="Transaction reference"
                          className="mt-2 w-full rounded-xl border border-slate-200 p-3"
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
                      onClick={completeSale}
                      disabled={checkoutLoading || cart.length === 0}
                      className="w-full rounded-xl bg-emerald-600 py-4 font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                      onClick={() => setReceipt(null)}
                      className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Dismiss receipt
                    </button>
                  </div>
                )}
              </div>
            )}

            {active === "Inventory" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold">Product Inventory</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Manage your store products.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAdd(true)}
                    className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white"
                  >
                    ＋ Add Product
                  </button>
                </div>

                {inventoryLoading && (
                  <p className="mt-4 text-sm text-slate-500">
                    Loading inventory...
                  </p>
                )}

                {inventoryError && (
                  <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    {inventoryError}
                  </p>
                )}

                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="p-3">Product</th>
                        <th className="p-3">Barcode</th>
                        <th className="p-3">Price</th>
                        <th className="p-3">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.id} className="border-b border-slate-100">
                          <td className="p-3 font-semibold">{product.name}</td>
                          <td className="p-3">{product.barcode || "—"}</td>
                          <td className="p-3">{peso(product.price)}</td>
                          <td className="p-3">{product.stock}</td>
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
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="text-xl font-bold">Barcode Scanner</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Connect a USB or Bluetooth barcode scanner, then scan into this field.
                  Most scanners type the barcode and press Enter.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        findBarcode();
                        setActive("Point of Sale");
                      }
                    }}
                    placeholder="Scan or enter barcode"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 p-3"
                  />
                  <button
                    onClick={() => {
                      findBarcode();
                      setActive("Point of Sale");
                    }}
                    className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white"
                  >
                    Find Product
                  </button>
                </div>
                <p className="mt-4 text-xs text-slate-400">
                  Camera-based scanning is not included in this version.
                </p>
              </div>
            )}

            {active !== "Dashboard" &&
              active !== "Inventory" &&
              active !== "Point of Sale" &&
              active !== "Barcode Scanner" && (
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

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={addProduct}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">Add Product</h3>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="text-2xl text-slate-400"
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium">
                Product name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 p-3"
                  placeholder="Enter product name"
                />
              </label>

              <label className="block text-sm font-medium">
                Barcode
                <input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 p-3"
                  placeholder="Optional barcode"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">
                  Selling price (₱)
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 p-3"
                  />
                </label>

                <label className="block text-sm font-medium">
                  Opening stock
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 p-3"
                  />
                </label>
              </div>
            </div>

            {inventoryError && (
              <p className="mt-3 text-sm text-red-600">{inventoryError}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-6 w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Product"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
