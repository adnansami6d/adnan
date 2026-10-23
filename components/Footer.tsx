import Link from "next/link";

// Optional contact info: set these in Vercel > Environment Variables (they are shown only when present)
const phone = process.env.NEXT_PUBLIC_CONTACT_PHONE;
const facebook = process.env.NEXT_PUBLIC_FACEBOOK_URL;

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="text-lg font-bold">Taz Fashion</p>
          <p className="mt-2 text-sm text-neutral-600">
            ক্যাশ অন ডেলিভারি। সারা বাংলাদেশে ডেলিভারি।
          </p>
        </div>

        <div className="text-sm">
          <p className="font-semibold">লিংক</p>
          <ul className="mt-2 space-y-1 text-neutral-600">
            <li>
              <Link href="/products" className="hover:underline">
                সব প্রোডাক্ট
              </Link>
            </li>
            <li>
              <Link href="/cart" className="hover:underline">
                কার্ট
              </Link>
            </li>
            <li>
              <Link href="/account/orders" className="hover:underline">
                আমার অর্ডার
              </Link>
            </li>
          </ul>
        </div>

        <div className="text-sm">
          <p className="font-semibold">যোগাযোগ</p>
          <ul className="mt-2 space-y-1 text-neutral-600">
            {phone && <li>ফোন: {phone}</li>}
            {facebook && (
              <li>
                <a href={facebook} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  Facebook
                </a>
              </li>
            )}
            {!phone && !facebook && <li>শীঘ্রই যোগ করা হবে</li>}
          </ul>
        </div>
      </div>
      <p className="border-t border-neutral-200 py-4 text-center text-xs text-neutral-500">
        © {new Date().getFullYear()} Taz Fashion. সর্বস্বত্ব সংরক্ষিত।
      </p>
    </footer>
  );
}
