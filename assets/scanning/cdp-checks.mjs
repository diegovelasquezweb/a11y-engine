export default {
  "interactiveRoles": ["button","link","textbox","combobox","listbox","menuitem","tab","checkbox","radio","switch","slider"],
  "rules": [
    {
      "id": "cdp-missing-accessible-name",
      "condition": "interactive-no-name",
      "impact": "serious",
      "tags": ["wcag2a","wcag412","cdp-check"],
      "help": "Interactive elements must have an accessible name",
      "helpUrl": "https://dequeuniversity.com/rules/axe/4.11/button-name",
      "description": "Interactive element with role \"{{role}}\" has no accessible name",
      "failureMessage": "Element with role \"{{role}}\" has no accessible name in the accessibility tree",
      "axeEquivalents": ["button-name","link-name","input-name","aria-command-name"]
    },
    {
      "id": "cdp-aria-hidden-focusable",
      "condition": "hidden-focusable",
      "impact": "serious",
      "tags": ["wcag2a","wcag412","cdp-check"],
      "help": "aria-hidden elements must not be focusable",
      "helpUrl": "https://dequeuniversity.com/rules/axe/4.11/aria-hidden-focus",
      "description": "Focusable element with role \"{{role}}\" is aria-hidden",
      "failureMessage": "Focusable element with role \"{{role}}\" is hidden from the accessibility tree",
      "axeEquivalents": ["aria-hidden-focus"]
    },
    {
      "id": "cdp-autoplay-media",
      "condition": "dom-eval",
      "impact": "serious",
      "tags": ["wcag2a","wcag142","wcag222","cdp-check"],
      "help": "Media elements must not autoplay without user control",
      "helpUrl": "https://www.w3.org/WAI/WCAG21/Understanding/audio-control.html",
      "description": "Media element autoplays without user control (WCAG 1.4.2, 2.2.2)",
      "failureMessage": "Media element has autoplay attribute without providing user controls to stop it",
      "axeEquivalents": []
    },
    {
      "id": "cdp-missing-main-landmark",
      "condition": "dom-eval",
      "impact": "moderate",
      "tags": ["wcag2a","wcag131","best-practice","cdp-check"],
      "help": "Page must have a main landmark",
      "helpUrl": "https://dequeuniversity.com/rules/axe/4.11/landmark-one-main",
      "description": "Page does not have a main landmark",
      "failureMessage": "Document does not contain a <main> element or an element with role=\"main\"",
      "axeEquivalents": ["landmark-one-main"]
    },
    {
      "id": "cdp-missing-skip-link",
      "condition": "dom-eval",
      "impact": "moderate",
      "tags": ["wcag2a","wcag241","best-practice","cdp-check"],
      "help": "Page must have a skip navigation link",
      "helpUrl": "https://www.w3.org/WAI/WCAG21/Understanding/bypass-blocks.html",
      "description": "Page does not have a skip navigation link as the first focusable element",
      "failureMessage": "No skip link found as first focusable element — keyboard users cannot bypass navigation",
      "axeEquivalents": ["bypass"]
    }
  ]
};
