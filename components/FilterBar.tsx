import Link from "next/link";
import Button from "./Button";

type Props = {
  categories: { name: string; slug: string }[];
  q: string;
  category: string;
  sort: string;
};

const fieldClass =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900";

/**
 * Plain GET form: works without JavaScript and keeps the filters in the URL
 * (so a filtered list can be shared or bookmarked).
 */
export default function FilterBar({ categories, q, category, sort }: Props) {
  const hasFilter = q !== "" || category !== "" || (sort !== "" && sort !== "new");

  return (
    <form action="/products" method="get" className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="প্রোডাক্টের নাম..."
        className={`${fieldClass} min-w-0 flex-1 sm:max-w-xs`}
      />

      <select name="category" defaultValue={category} className={fieldClass} aria-label="ক্যাটেগরি">
        <option value="">সব ক্যাটেগরি</option>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>

      <select name="sort" defaultValue={sort || "new"} className={fieldClass} aria-label="সাজানো">
        <option value="new">নতুন আগে</option>
        <option value="price_asc">দাম: কম থেকে বেশি</option>
        <option value="price_desc">দাম: বেশি থেকে কম</option>
      </select>

      <Button type="submit" size="sm">
        খুঁজুন
      </Button>

      {hasFilter && (
        <Link href="/products" className="text-sm text-neutral-600 underline">
          ফিল্টার মুছুন
        </Link>
      )}
    </form>
  );
      }
