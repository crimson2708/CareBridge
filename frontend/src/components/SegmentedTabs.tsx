import { motion } from "framer-motion";

type SegmentedTabsProps<T extends string> = {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string }>;
  /** Shared across instances would collide, so each mount gets its own id. */
  layoutId: string;
};

export default function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  layoutId,
}: SegmentedTabsProps<T>) {
  return (
    <div className="segmented-tabs" role="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={active ? "segmented-tab is-active" : "segmented-tab"}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="segmented-tab-indicator"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
