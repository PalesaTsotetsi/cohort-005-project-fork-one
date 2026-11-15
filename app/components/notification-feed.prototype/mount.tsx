// PROTOTYPE — throwaway. Glue between the app shell and the feed variants.
import { PrototypeSwitcher, usePrototypeVariant } from "~/components/prototype-switcher";
import { useFeed } from "./state";
import { FEED_VARIANTS, type FeedVariantKey } from "./variants";

const KEYS = Object.keys(FEED_VARIANTS) as FeedVariantKey[];

export function useFeedVariant() {
  const key = usePrototypeVariant(KEYS);
  return { key, ...FEED_VARIANTS[key] };
}

export function FeedSwitcher({ current }: { current: FeedVariantKey }) {
  const feed = useFeed();
  return (
    <PrototypeSwitcher variants={FEED_VARIANTS} current={current}>
      <span className="font-mono text-zinc-400" title="Knock-style item states for the current user">
        unseen {feed.unseenCount} · unread {feed.unreadCount} · archived {feed.archived.length} · total{" "}
        {feed.items.length}
      </span>
      <button onClick={feed.simulate} className="rounded-full bg-white/10 px-2 py-0.5 hover:bg-white/20">
        + arrive
      </button>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={feed.empty} onChange={(e) => feed.setEmpty(e.target.checked)} />
        empty
      </label>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={feed.toasts} onChange={(e) => feed.setToasts(e.target.checked)} />
        toast
      </label>
    </PrototypeSwitcher>
  );
}
