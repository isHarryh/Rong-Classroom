"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, Dropdown } from "antd";
import { BarChart3, BookOpen, ChevronDown, Laptop, LogOut, Settings, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/client";

const items = [
  { href: "/admin", label: "数据看板", icon: BarChart3 },
  { href: "/admin/classes", label: "班级管理", icon: BookOpen },
  { href: "/admin/clients", label: "设备管理", icon: Laptop },
];

const systemItems = [
  { href: "/admin/settings", label: "原因设置", icon: Settings },
  { href: "/admin/accounts", label: "账号管理", icon: ShieldCheck },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<{
    kind: string;
    name: string;
    username?: string;
    role: number;
  }>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<{ session: typeof session }>("/api/auth/session")
      .then(data => {
        if (!data.session || data.session.kind !== "admin") router.replace("/");
        else setSession(data.session);
      })
      .catch(() => router.replace("/"))
      .finally(() => setLoading(false));
  }, [router]);
  function logout() {
    void api("/api/auth/logout", { method: "POST" })
      .catch(() => {})
      .finally(() => router.replace("/login"));
  }
  if (loading || !session)
    return (
      <div className="admin-shell">
        <header className="admin-header">
          <Brand />
          <div className="header-actions">
            <i className="skeleton-block" style={{ width: 92, height: 16 }} />
            <i className="skeleton-block" style={{ width: 66, height: 22, borderRadius: 999 }} />
            <i className="skeleton-block" style={{ width: 16, height: 16 }} />
          </div>
        </header>
        <aside className="admin-sidebar">
          <div className="nav-label">工作台</div>
          {items.map(item => (
            <div className="nav-item skeleton" key={item.href}>
              <i className="skeleton-block" style={{ width: 18, height: 18, flexShrink: 0 }} />
              <span className="skeleton-block" style={{ width: 84, height: 15 }} />
            </div>
          ))}
        </aside>
        <main className="admin-main">
          <div className="page-heading">
            <div style={{ display: "grid", gap: 13 }}>
              <i className="skeleton-block" style={{ width: 178, height: 28 }} />
              <i className="skeleton-block" style={{ width: 252, height: 15 }} />
            </div>
            <i className="skeleton-block" style={{ width: 210, height: 32 }} />
          </div>
          <div className="metric-grid">
            {[0, 1, 2, 3].map(item => (
              <div className="metric-card" key={item}>
                <i className="skeleton-block" style={{ width: 72, height: 14 }} />
                <i className="skeleton-block" style={{ width: 96, height: 31, marginTop: 14 }} />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Brand />
        <div className="header-actions">
          <span className="user-name">{session.name} 老师</span>
          <span className="user-role">{session.role === 1 ? "超级管理员" : "普通教师"}</span>
          <Dropdown
            menu={{
              items: [
                {
                  key: "logout",
                  label: "退出登录",
                  icon: <LogOut size={15} />,
                  onClick: logout,
                },
              ],
            }}
            trigger={["click"]}
          >
            <Button type="text" icon={<ChevronDown size={16} />} aria-label="用户菜单" />
          </Dropdown>
        </div>
      </header>
      <aside className="admin-sidebar">
        <div className="nav-label">工作台</div>
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            className={`nav-item ${pathname === href || (href !== "/admin" && pathname.startsWith(href)) ? "active" : ""}`}
            href={href}
          >
            <Icon size={18} />
            <span>{label}</span>
          </Link>
        ))}
        {session.role === 1 && (
          <>
            <div className="nav-label" style={{ marginTop: 27 }}>
              系统
            </div>
            {systemItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                className={`nav-item ${pathname === href || pathname.startsWith(href) ? "active" : ""}`}
                href={href}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            ))}
          </>
        )}
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
