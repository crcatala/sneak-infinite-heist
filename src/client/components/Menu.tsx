// Console-style menus: a vertical list navigated with arrows/WASD + Enter/Esc, mouse or touch.
// The focused item gets the gold "flashlight" highlight and a bobbing magnifier cursor.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { sfx } from "../sfx";
import { Icon } from "./Icon";

export interface MenuItem {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  icon?: string;
  disabled?: boolean;
  /** Left/right adjusts this item instead of moving focus (e.g. a counter). */
  onAdjust?: (dir: -1 | 1) => void;
  onSelect?: () => void;
}

/** Keys that shouldn't be stolen from text inputs. */
function typing(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) && (el as HTMLInputElement).type !== "range";
}

export function useMenuKeys(opts: { count: number; focus: number; setFocus: (i: number) => void; onSelect: (i: number) => void; onBack?: () => void; onAdjust?: (i: number, dir: -1 | 1) => boolean; enabled?: boolean }) {
  const ref = useRef(opts);
  ref.current = opts;
  useEffect(() => {
    if (opts.enabled === false) return;
    // A key press that mounted this menu (e.g. Enter on the previous page) must not also act on it:
    // start listening only once the current event has finished dispatching.
    let live = false;
    const arm = setTimeout(() => (live = true), 0);
    const onKey = (e: KeyboardEvent) => {
      const o = ref.current;
      if (!live) return;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (typing(e)) {
        if (k === "escape" && o.onBack) {
          e.preventDefault();
          o.onBack();
          sfx.menuBack();
        }
        return;
      }
      if (k === "arrowdown" || k === "s") {
        e.preventDefault();
        o.setFocus((o.focus + 1) % o.count);
        sfx.menuMove();
      } else if (k === "arrowup" || k === "w") {
        e.preventDefault();
        o.setFocus((o.focus - 1 + o.count) % o.count);
        sfx.menuMove();
      } else if (k === "arrowleft" || k === "a" || k === "arrowright" || k === "d") {
        const dir = k === "arrowleft" || k === "a" ? -1 : 1;
        if (o.onAdjust?.(o.focus, dir)) {
          e.preventDefault();
          sfx.menuMove();
        }
      } else if (k === "enter" || k === " ") {
        e.preventDefault();
        o.onSelect(o.focus);
      } else if ((k === "escape" || k === "backspace") && o.onBack) {
        e.preventDefault();
        o.onBack();
        sfx.menuBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(arm);
      window.removeEventListener("keydown", onKey);
    };
  }, [opts.enabled]);
}

export function MenuList({ items, onBack, initial = 0, className = "", enabled = true }: { items: MenuItem[]; onBack?: () => void; initial?: number; className?: string; enabled?: boolean }) {
  const [focus, setFocusState] = useState(() => Math.min(initial, items.length - 1));
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const setFocus = useCallback((i: number) => {
    setFocusState(i);
    buttons.current[i]?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    buttons.current[focus]?.focus({ preventScroll: true });
    // Focus the first item when the page appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (i: number) => {
    const item = items[i];
    if (!item || item.disabled) {
      sfx.error();
      return;
    }
    if (item.onSelect) {
      sfx.menuSelect();
      item.onSelect();
    } else item.onAdjust?.(1);
  };

  useMenuKeys({
    count: items.length,
    focus,
    setFocus,
    onSelect: select,
    onBack,
    enabled,
    onAdjust: (i, dir) => {
      const item = items[i];
      if (!item?.onAdjust || item.disabled) return false;
      item.onAdjust(dir);
      return true;
    },
  });

  return (
    <div className={`menu-list ${className}`} role="menu">
      {items.map((item, i) => (
        <button
          key={item.id}
          ref={(el) => {
            buttons.current[i] = el;
          }}
          role="menuitem"
          className={`menu-item${i === focus ? " focused" : ""}${item.disabled ? " disabled" : ""}`}
          aria-disabled={item.disabled || undefined}
          style={{ animationDelay: `${i * 45}ms` }}
          onMouseEnter={() => {
            if (i !== focus) {
              setFocus(i);
              sfx.menuMove();
            }
          }}
          onFocus={() => setFocusState(i)}
          onClick={(e) => {
            e.preventDefault();
            select(i);
          }}
        >
          <span className="menu-beam" aria-hidden />
          <span className="menu-cursor" aria-hidden>
            <Icon name="magnifier" size={22} />
          </span>
          {item.icon && <Icon name={item.icon} size={24} className="menu-icon" />}
          <span className="menu-label">{item.label}</span>
          {item.onAdjust && (
            <span className="menu-adjust" aria-hidden>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  item.onAdjust!(-1);
                  sfx.menuMove();
                }}
              >
                ◀
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  item.onAdjust!(1);
                  sfx.menuMove();
                }}
              >
                ▶
              </span>
            </span>
          )}
          {item.hint && <span className="menu-hint">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}

/** Title + subtitle header for a menu page. */
export function MenuHeader({ title, sub, onBack }: { title: ReactNode; sub?: ReactNode; onBack?: () => void }) {
  return (
    <header className="menu-header">
      {onBack && (
        <button
          className="btn small icon ghost menu-back"
          aria-label="Back"
          onClick={() => {
            sfx.menuBack();
            onBack();
          }}
        >
          <Icon name="back" />
        </button>
      )}
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
    </header>
  );
}

export function KeyHints({ back = true, adjust = false }: { back?: boolean; adjust?: boolean }) {
  return (
    <p className="kbd-hint menu-keys">
      <kbd>↑</kbd>
      <kbd>↓</kbd> move {adjust && (
        <>
          · <kbd>←</kbd>
          <kbd>→</kbd> change
        </>
      )}{" "}
      · <kbd>Enter</kbd> select {back && (
        <>
          · <kbd>Esc</kbd> back
        </>
      )}
    </p>
  );
}
