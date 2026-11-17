import { useState } from "react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";
import {
  useNotificationPreferences,
  type NotificationPreferencesConnection,
} from "~/lib/notification-feed";
import {
  CATEGORY_LABELS,
  type NotificationCategory,
} from "~/lib/notifications";

type NotificationSwitch = {
  category: NotificationCategory;
  description: string;
};

type SaveState = "saving" | "saved" | "failed";

/**
 * The Notifications section of /settings: one row per Notification Category
 * the person is shown, one "In Cadence" column. Each switch saves when
 * flipped; a failed save flips it back and says so.
 */
export function NotificationPreferencesSection({
  switches,
  connection,
}: {
  switches: NotificationSwitch[];
  connection: NotificationPreferencesConnection | null;
}) {
  const preferences = useNotificationPreferences(connection);
  const [saveStates, setSaveStates] = useState<
    Partial<Record<NotificationCategory, SaveState>>
  >({});

  function flip(category: NotificationCategory, enabled: boolean) {
    setSaveStates((current) => ({ ...current, [category]: "saving" }));
    preferences.setEnabled(category, enabled).then(
      () => setSaveStates((current) => ({ ...current, [category]: "saved" })),
      () => setSaveStates((current) => ({ ...current, [category]: "failed" }))
    );
  }

  return (
    <Card id="notifications" className="mt-8 max-w-md scroll-mt-8">
      <CardHeader>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Choose what reaches you. Changes apply to new Notifications only.
        </p>
      </CardHeader>
      <CardContent>
        {preferences.status === "unavailable" ? (
          <p className="text-sm text-muted-foreground">
            Notification settings are unavailable right now.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="pb-2 font-medium">
                  Category
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  In Cadence
                </th>
              </tr>
            </thead>
            <tbody>
              {switches.map(({ category, description }) => {
                const saveState = saveStates[category];
                const labelId = `notification-category-${category}`;
                return (
                  <tr key={category} className="border-t">
                    <td className="py-3 pr-4">
                      <div id={labelId} className="font-medium">
                        {CATEGORY_LABELS[category]}
                      </div>
                      <div className="text-muted-foreground">{description}</div>
                      {saveState === "failed" && (
                        <div role="alert" className="mt-1 text-destructive">
                          Couldn't save. Your setting was not changed.
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-right align-top">
                      <div className="flex items-center justify-end gap-2">
                        {saveState === "saved" && (
                          <span
                            aria-live="polite"
                            className="text-xs text-muted-foreground"
                          >
                            Saved
                          </span>
                        )}
                        <Switch
                          aria-labelledby={labelId}
                          checked={preferences.enabled[category]}
                          disabled={
                            preferences.status !== "ready" ||
                            saveState === "saving"
                          }
                          onCheckedChange={(enabled) => flip(category, enabled)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
