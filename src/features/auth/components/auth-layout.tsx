import Image from "next/image";
import Link from "next/link";
import { AuthHero } from "@/features/auth/components/auth-hero";
import { AuthTaglineSlider } from "@/features/auth/components/auth-tagline-slider";

export const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="auth-page">
      <div className="auth-shell">
        <aside className="auth-aside">
          <div className="absolute left-6 top-6 z-30">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.svg"
                alt="Zyntek.SAS"
                width={26}
                height={17}
                priority
              />
              <span className="text-sm font-semibold tracking-tight text-slate-900">
                Zyntek<span className="text-[#007BFF]">.SAS</span>
              </span>
            </Link>
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <AuthHero />
            <AuthTaglineSlider />
          </div>
        </aside>

        <main className="auth-main">
          <div className="auth-mobile-brand">
            <Image
              src="/logo.svg"
              alt="Zyntek.SAS"
              width={26}
              height={17}
              priority
            />
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              Zyntek<span className="text-[#007BFF]">.SAS</span>
            </span>
          </div>

          <div className="auth-form-slot relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
};
