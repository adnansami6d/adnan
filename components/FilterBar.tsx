"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "./Button";

type Props = {
  categories: { name: string; slug: string }[];
  q: string;
  category: string;
  sort: string;
};

/**
 * Plain GET form: works without JavaScript and keeps the filters in the URL
 * (so a filtered list can be shared or bookmarked).
 * Phone: only the search box + two buttons are visible, category and sort fold away behind "ফিল্টার".
 * Wide screens: everything is shown in one row.
 */
export default function FilterBar({ categories, q, category, sort }: Props) {
  const [open, setOpen] = useState(category !== "" || (sort !== "" && sort !== "new"));
  const activeCount = (category !== "" ? 1 : 0) + (sort !== "" && sort !== "new" ? 1 : 0);
  const hasFilter = q !== "" || activeCount > 0;

  return (
    <form action="/products" method="get" className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="প্রোডাক্টের নাম..."
          className="input-pill min-w-0 flex-1 md:max-w-xs"
        />
        <Button type="submit" size="md">
          খুঁজুন
        </Button>
        <Button
          type="button"
          variant="outline"
          size="md"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="relative md:hidden"
        >
          ফিল্টার
          {activeCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1 text-xs text-white">
              {activeCount}
            </span>
          )}
        </Button>
      </div>

      {/* category + sort: folded on phones (they still get sent with the form even when hidden) */}
      <div className={`${open ? "grid" : "hidden"} grid-cols-1 gap-3 sm:grid-cols-2 md:flex md:flex-wrap md:items-center`}>
        <select name="category" defaultValue={category} className="input-pill md:w-auto" aria-label="ক্যাটেগরি">
          <option value="">সব ক্যাটেগরি</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>

        <select name="sort" defaultValue={sort || "new"} className="input-pill md:w-auto" aria-label="সাজানো">
          <option value="new">নতুন আগে</option>
          <option value="price_asc">দাম: কম থেকে বেশি</option>
          <option value="price_desc">দাম: বেশি থেকে কম</option>
        </select>
      </div>

      {hasFilter && (
        <Link href="/products" className="btn btn-ghost btn-sm">
          ফিল্টার মুছুন
        </Link>
      )}
    </form>
  );
}
