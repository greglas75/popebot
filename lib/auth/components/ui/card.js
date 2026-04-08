import { jsx } from "react/jsx-runtime";
function Card({ children, className = "" }) {
  return /* @__PURE__ */ jsx("div", { className: `rounded-lg border border-border bg-muted p-6 ${className}`, children });
}
function CardHeader({ children, className = "" }) {
  return /* @__PURE__ */ jsx("div", { className: `mb-4 ${className}`, children });
}
function CardTitle({ children, className = "" }) {
  return /* @__PURE__ */ jsx("h2", { className: `text-lg font-semibold text-foreground ${className}`, children });
}
function CardDescription({ children, className = "" }) {
  return /* @__PURE__ */ jsx("p", { className: `text-sm text-muted-foreground ${className}`, children });
}
function CardContent({ children, className = "" }) {
  return /* @__PURE__ */ jsx("div", { className, children });
}
export {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
};
