"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Inline delete confirmation without a blocking native dialog: the first click
 * arms the button ("Confirm?"), a second click within 3s deletes; otherwise it
 * disarms automatically. Props: onDelete().
 */
export default function DeleteButton({ onDelete }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleClick = () => {
    if (armed) {
      clearTimeout(timer.current);
      setArmed(false);
      onDelete();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 3000);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`underline ${armed ? "font-semibold" : ""}`}
      style={{ color: "#8B1D1D" }}
      title={armed ? "Click again to delete" : "Delete"}
    >
      {armed ? "Confirm?" : "Delete"}
    </button>
  );
}
