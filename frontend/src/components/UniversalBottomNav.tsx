import { useLocation, useNavigate } from "react-router-dom";

export type TabDef = {
  route: string;
  label: string;
  icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
    style?: React.CSSProperties;
  }>;
};

export default function UniversalBottomNav({
  tabs,
  badgeRoute,
  badgeCount,
}: {
  tabs: TabDef[];
  badgeRoute: string;
  badgeCount: number;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav
      className="universal-nav border-t backdrop-blur-xl"
      aria-label="Primary"
      style={{
        backgroundColor: "var(--bg-glass)",
        borderColor: "var(--border-subtle)",
        gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
      }}
    >
      {tabs.map(({ route, label, icon: Icon }) => {
        // nested routes (a patient, a handoff) keep their parent tab lit
        const active = location.pathname.startsWith(route);
        const badge = route === badgeRoute ? badgeCount : 0;

        return (
          <button
            key={route}
            type="button"
            onClick={() => navigate(route)}
            className="universal-nav-item transition-colors"
            aria-current={active ? "page" : undefined}
          >
            {active && (
              <span
                className="universal-nav-indicator"
                style={{ backgroundColor: "var(--primary)" }}
              />
            )}
            <span className="relative">
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 2}
                style={{ color: active ? "var(--primary)" : "var(--text-muted)" }}
                className="transition-colors"
              />
              {badge > 0 && (
                <span className="nav-badge" aria-label={`${badge} awaiting response`}>
                  {badge}
                </span>
              )}
            </span>
            <span
              className={
                active
                  ? "universal-nav-label active font-bold"
                  : "universal-nav-label font-medium"
              }
              style={{ color: active ? "var(--text-primary)" : "var(--text-muted)" }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
