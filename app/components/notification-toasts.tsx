import { useEffect } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { useNotificationFeed } from "~/lib/notification-feed";

/** Shows a bottom-left toast for each Notification that arrives live. */
export function NotificationToasts() {
  const { onArrival } = useNotificationFeed();

  useEffect(
    () =>
      onArrival((arrived) => {
        for (const notification of arrived) {
          toast(notification.title, {
            id: `notification-${notification.id}`,
            description: notification.snippet ?? notification.course,
            icon: <Bell className="size-4" />,
            position: "bottom-left",
          });
        }
      }),
    [onArrival]
  );

  return null;
}
