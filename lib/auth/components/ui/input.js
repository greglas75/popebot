"use client";
import { jsx } from "react/jsx-runtime";
function Input({ className = "", ...props }) {
  return /* @__PURE__ */ jsx(
    "input",
    {
      className: `flex h-10 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`,
      ...props
    }
  );
}
export {
  Input
};
