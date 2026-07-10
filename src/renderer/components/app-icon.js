const icons = {
  "external-link": {
    paths: `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/> <polyline points="15 3 21 3 21 9"/> <line x1="10" y1="14" x2="21" y2="3"/>`
  },
  "download-cloud": {
    paths: `<path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/> <polyline points="8 16 12 20 16 16"/> <line x1="12" y1="12" x2="12" y2="20"/>`
  },
  "info": {
    paths: `<circle cx="12" cy="12" r="10"/> <line x1="12" y1="16" x2="12" y2="12"/> <line x1="12" y1="8" x2="12.01" y2="8"/>`
  },
  "minus": {
    paths: `<line x1="5" y1="12" x2="19" y2="12"/>`
  },
  "square": {
    paths: `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>`
  },
  "x": {
    paths: `<line x1="18" y1="6" x2="6" y2="18"/> <line x1="6" y1="6" x2="18" y2="18"/>`
  },
  "globe": {
    paths: `<circle cx="12" cy="12" r="10"/> <line x1="2" y1="12" x2="22" y2="12"/> <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>`
  },
  "play": {
    paths: `<polygon points="6 3 20 12 6 21 6 3"/>`,
    fill: "currentColor"
  },
  "settings": {
    paths: `<circle cx="12" cy="12" r="3"/> <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`
  },
  "refresh": {
    paths: `<polyline points="23 4 23 10 17 10"/> <polyline points="1 20 1 14 7 14"/> <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>`
  },
  "map": {
    paths: `<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/> <line x1="9" y1="3" x2="9" y2="18"/> <line x1="15" y1="6" x2="15" y2="21"/>`
  },
  "star": {
    paths: `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`
  },
  "clock": {
    paths: `<circle cx="12" cy="12" r="10"/> <polyline points="12 6 12 12 16 14"/>`
  },
  "alert": {
    paths: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/> <line x1="12" y1="9" x2="12" y2="13"/> <line x1="12" y1="17" x2="12.01" y2="17"/>`
  },
  "git-branch": {
    paths: `<line x1="6" y1="3" x2="6" y2="15"/> <circle cx="18" cy="6" r="3"/> <circle cx="6" cy="18" r="3"/> <path d="M6 15a9 9 0 0 0 9-9"/>`
  },
  "columns": {
    paths: `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/> <line x1="3" y1="9" x2="21" y2="9"/> <line x1="3" y1="15" x2="21" y2="15"/> <line x1="9" y1="9" x2="9" y2="21"/>`
  },
  "check": {
    paths: `<polyline points="20 6 9 17 4 12"/>`
  },
  "wrench": {
    paths: `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>`
  },
  "save": {
    paths: `<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/> <polyline points="17 21 17 13 7 13 7 21"/> <polyline points="7 3 7 8 15 8"/>`
  },
  "trash": {
    paths: `<polyline points="3 6 5 6 21 6"/> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/> <line x1="10" y1="11" x2="10" y2="17"/> <line x1="14" y1="11" x2="14" y2="17"/>`
  },
  "eye": {
    paths: `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/> <circle cx="12" cy="12" r="3"/>`
  },
  "plus": {
    paths: `<line x1="12" y1="5" x2="12" y2="19"/> <line x1="5" y1="12" x2="19" y2="12"/>`
  },
  "palette": {
    paths: `<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/> <path d="M7.5 10.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/> <path d="M11.5 7.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/> <path d="M16.5 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/> <path d="M6 14c0-2 2-3 4-3 2.5 0 4.5 1.5 4.5 3.5 0 1.5-1 2.5-2.5 2.5h-1c-1.5 0-3 1.5-3 3 0 .5-.5 1-1 1A5 5 0 0 1 6 14z"/>`
  },
  "folder": {
    paths: `<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>`
  },
  "search": {
    paths: `<circle cx="11" cy="11" r="8"/> <line x1="21" y1="21" x2="16.65" y2="16.65"/>`
  },
  "download": {
    paths: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/> <polyline points="7 10 12 15 17 10"/> <line x1="12" y1="15" x2="12" y2="3"/>`
  },
  "clipboard": {
    paths: `<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/> <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>`
  },
  "plug": {
    paths: `<path d="M12 2v5M19 8v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6V8M10 17v4M14 17v4"/>`
  },
  "copy": {
    paths: `<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`
  },
  "loader": {
    paths: `<path d="M21 12a9 9 0 1 1-6.219-8.56"/>`
  },
  "cube": {
    paths: `<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/> <polyline points="3.27 6.96 12 12.01 20.73 6.96"/> <line x1="12" y1="22.08" x2="12" y2="12"/>`
  },
  "signal": {
    paths: `<path d="M2 20h.01"/> <path d="M7 20v-4"/> <path d="M12 20v-8"/> <path d="M17 20V8"/> <path d="M22 20V4"/>`
  }
};

class AppIcon extends HTMLElement {
  static get observedAttributes() {
    return ["name", "fill", "stroke", "stroke-width"];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  render() {
    const name = this.getAttribute("name");
    const iconData = icons[name];
    if (!iconData) {
      this.replaceChildren();
      return;
    }

    const viewBox = iconData.viewBox || "0 0 24 24";
    const fill = this.getAttribute("fill") || iconData.fill || "none";
    const stroke = this.getAttribute("stroke") || iconData.stroke || "currentColor";
    const strokeWidth = this.getAttribute("stroke-width") || iconData.strokeWidth || "2";
    const strokeLinecap = iconData.strokeLinecap || "round";
    const strokeLinejoin = iconData.strokeLinejoin || "round";

    this.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="${strokeLinecap}" stroke-linejoin="${strokeLinejoin}">${iconData.paths}</svg>`;
  }
}

customElements.define("app-icon", AppIcon);
