import React from "react";

interface Props {
  status: "Pending"| "Completed";
}

function TripStatusBadge({ status }: Props) {
  const styles = {
    Pending: "bg-yellow-100 text-yellow-700",
    Completed: "bg-green-100 text-green-700",
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

export default React.memo(TripStatusBadge);