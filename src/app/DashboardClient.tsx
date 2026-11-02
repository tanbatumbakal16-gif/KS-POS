
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
  name: string;
  price: number;
  stock: number;
  barcode: string;
};

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

  useEffect(() => {
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
              name: string;
              sellingPrice: number;
              stock: number;
              barcode: string | null;
            }) => ({
              name: product.name,
              price: product.sellingPrice,
              stock: product.stock,
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

    loadInventory();
  }, []);

  async function addProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInventoryError("");

    if (!name.trim() || Number(price) < 0 || Number(stock) < 0) {
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

      setProducts((current) => [
        ...current,
        {
          name: data.product.name,
          price: data.product.sellingPrice,
          stock: data.product.stock,
          barcode: data.product.barcode || "",
        },
      ]);

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
                    ["Today's Sales", "₱0.00", "↗", "All transactions"],
                    ["Transactions", "0", "#", "Today's orders"],
                    ["Products", String(products.length), "▤", "Registered products"],
                    ["Low Stock", String(products.filter((p) => p.stock <= 5).length), "!", "Needs attention"],
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
                      Sales chart will appear when transactions are recorded.
                    </p>
                    <div className="flex h-52 flex-col items-center justify-center text-center">
                      <span className="text-4xl text-slate-300">▥</span>
                      <p className="mt-3 text-sm font-semibold text-slate-500">
                        No sales recorded yet
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
                      {products.map((product, index) => (
                        <tr key={`${product.name}-${index}`} className="border-b border-slate-100">
                          <td className="p-3 font-semibold">{product.name}</td>
                          <td className="p-3">{product.barcode || "—"}</td>
                          <td className="p-3">₱{product.price.toFixed(2)}</td>
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

            {active !== "Dashboard" && active !== "Inventory" && (
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
