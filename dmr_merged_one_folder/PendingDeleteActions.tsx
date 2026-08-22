import { PendingDeleteNotification } from "./PendingDeleteNotification";

type PendingDeleteActionsProps = {
  secondsLeft: number;
  onCancel: () => void;
  committing?: boolean;
  label?: string;
};

/** Compatibility wrapper. New call sites should use PendingDeleteNotification. */
export function PendingDeleteActions({
  secondsLeft,
  onCancel,
  committing = false,
  label,
}: PendingDeleteActionsProps) {
  return (
    <PendingDeleteNotification
      items={[{ id: "pending", secondsLeft, committing, label }]}
      onCancel={() => onCancel()}
    />
  );
}
