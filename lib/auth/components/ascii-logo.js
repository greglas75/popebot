import { jsx } from "react/jsx-runtime";
function AsciiLogo() {
  return /* @__PURE__ */ jsx("pre", { className: "text-foreground text-[clamp(0.45rem,1.5vw,0.85rem)] leading-snug text-left mb-8 select-none", children: ` _____ _          ____                  ____        _
|_   _| |__   ___|  _ \\ ___  _ __   ___| __ )  ___ | |_
  | | | '_ \\ / _ \\ |_) / _ \\| '_ \\ / _ \\  _ \\ / _ \\| __|
  | | | | | |  __/  __/ (_) | |_) |  __/ |_) | (_) | |_
  |_| |_| |_|\\___|_|   \\___/| .__/ \\___|____/ \\___/ \\__|
                            |_|` });
}
export {
  AsciiLogo
};
