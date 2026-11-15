// PROTOTYPE — throwaway. Host page for Notification Feed variant C (ticket #12).
import { Link } from "react-router";
import { InboxPage } from "~/components/notification-feed.prototype/variants";
import { useFeedVariant } from "~/components/notification-feed.prototype/mount";

export default function NotificationsPrototype() {
  const { key } = useFeedVariant();
  if (key !== "C")
    return (
      <div className="p-10 text-sm text-muted-foreground">
        This page only exists in variant C.{" "}
        <Link to="?variant=C" className="text-primary underline">
          Switch to C
        </Link>
      </div>
    );
  return <InboxPage />;
}
