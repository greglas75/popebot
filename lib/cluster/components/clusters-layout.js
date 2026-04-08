"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { PageLayout } from "../../chat/components/page-layout.js";
function ClustersLayout({ session, children }) {
  return /* @__PURE__ */ jsxs(PageLayout, { session, children: [
    /* @__PURE__ */ jsx("div", { className: "mb-6", children: /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold", children: "Clusters" }) }),
    children
  ] });
}
export {
  ClustersLayout
};
