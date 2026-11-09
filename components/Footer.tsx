import Link from "next/link";
import Logo from "./Logo";

// Optional contact info: set these in Vercel > Environment Variables (they are shown only when present)
const phone = process.env.NEXT_PUBLIC_CONTACT_PHONE;
const facebook = process.env.NEXT_PUBLIC_FACEBOOK_URL;

export default function Footer() {
  return (
    <footer className="mx-auto mt-16 w-full max-w-6xl px-3 pb-4">
      <div className="card overflow-hidden">
      <div className="grid gap-8 px-6 py-8 sm:grid-cols-3">
        <div>
          <Logo size="lg" />
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
              <Link href="/track" className="hover:underline">
                অর্ডার ট্র্যাক করুন
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
      <p className="border-t border-black/5 py-4 text-center text-xs text-neutral-500">
        © {new Date().getFullYear()} Taz Fashion. সর্বস্বত্ব সংরক্ষিত।
      </p>
      </div>
    </footer>
  );
      }
