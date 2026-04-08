import { jsx } from "react/jsx-runtime";
function Label({ children, className = "", ...props }) {
  return /* @__PURE__ */ jsx(
    "label",
    {
      className: `text-sm font-medium text-foreground ${className}`,
      ...props,
      children
    }
  );
}
export {
  Label
};
