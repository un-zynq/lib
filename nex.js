const BASE_CDN = "https://nxyderrr-assets.pages.dev/";

window.nex = new Proxy({}, {
    get(target, gid) {
        if (!target[gid]) {
            target[gid] = {
                _earlyListeners: {},
                _element: null,
                on(event, callback) {
                    if (this._element) {
                        this._element._registerListener(event, callback);
                    } else {
                        if (!this._earlyListeners[event]) this._earlyListeners[event] = [];
                        this._earlyListeners[event].push(callback);
                    }
                },
                start() {
                    if (this._element) this._element.start();
                }
            };
        }
        return target[gid];
    }
});

class NexGame extends HTMLElement {
    static get observedAttributes() { return ["alias", "gid"]; }
    constructor() {
        super();
        this._htmlContent = "";
        this._listeners = {};
        this._isValid = true;
        this.attachShadow({ mode: "open" });
    }

    get alias() { return this.getAttribute("alias"); }
    get gid() { return this.getAttribute("gid"); }

    connectedCallback() {
        this.shadowRoot.innerHTML = `<style>:host{display:block;width:100%;height:100%;background:#000;position:relative}iframe{width:100%;height:100%;border:0;display:block}</style>`;
        
        if (!this.gid) return;

        const registry = window.nex[this.gid];

        if (registry._element) {
            this._isValid = false;
            console.error(`[NEX ERROR] gID "${this.gid}" already in use.`);
            this.shadowRoot.innerHTML = `<style>:host{display:block;background:#300;color:#fff;padding:10px}</style><div>[NEX ERROR] Duplicate gID: ${this.gid}</div>`;
            return;
        }

        registry._element = this;

        if (registry._earlyListeners) {
            for (const event in registry._earlyListeners) {
                registry._earlyListeners[event].forEach(callback => {
                    this._registerListener(event, callback);
                });
            }
            delete registry._earlyListeners;
        }

        if (this.alias) {
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", () => this.init());
            } else {
                setTimeout(() => this.init(), 0);
            }
        }
    }

    disconnectedCallback() {
        if (this._isValid && this.gid && window.nex[this.gid]) {
            delete window.nex[this.gid];
        }
    }

    _registerListener(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
    }

    _trigger(event, data = {}) {
        if (!this._isValid) return;
        if (this._listeners[event]) {
            this._listeners[event].forEach(callback => callback(data));
        }
    }

    async init() {
        if (!this._isValid) return;
        try {
            this._trigger("progress", { progress: 5 });
            
            const resList = await fetch(`${BASE_CDN}game_list.json`);
            const data = await resList.json();
            
            const chunked = data[0] || [];
            const streamed = data[1] || [];

            if (streamed.includes(this.alias)) {
                this._trigger("progress", { progress: 30 });
                const res = await fetch(`${BASE_CDN}external/${this.alias}.html`);
                this._htmlContent = await res.text();
            } 
            else if (chunked.includes(this.alias)) {
                const nrRes = await fetch(`${BASE_CDN}${this.alias}/nr.txt`);
                const total = parseInt(await nrRes.text(), 10);

                for (let i = 1; i <= total; i++) {
                    const part = await fetch(`${BASE_CDN}${this.alias}/src.part${i}.html`);
                    this._htmlContent += await part.text();
                    
                    const pct = Math.floor(10 + (i / total) * 85);
                    this._trigger("progress", { progress: pct });
                }
            } else {
                throw new Error("Game not found in manifest");
            }

            this._trigger("progress", { progress: 100 });
            this._trigger("ready");
        } catch (e) {
            this._trigger("error", { message: e.message });
        }
    }

    start() {
        if (!this._isValid || !this._htmlContent) return;
        if (this.shadowRoot.querySelector("iframe")) return;

        // Geen base URL hacks meer in de HTML. 
        // We injecteren in plaats daarvan een flinterdun script dat de URL constructor repareert voor games die crashen op about:srcdoc.
        const urlPatchScript = `
            <script>
            (function() {
                const OriginalURL = window.URL;
                window.URL = function(url, base) {
                    if (base && (base.startsWith('about:') || base.startsWith('srcdoc'))) {
                        base = window.location.origin + '/';
                    }
                    try {
                        return new OriginalURL(url, base);
                    } catch(e) {
                        return new OriginalURL(url, window.location.origin + '/');
                    }
                };
                window.URL.prototype = OriginalURL.prototype;
                window.URL.createObjectURL = OriginalURL.createObjectURL;
                window.URL.revokeObjectURL = OriginalURL.revokeObjectURL;
            })();
            </script>
        `;

        let finalContent = this._htmlContent;
        if (finalContent.includes("<head>")) {
            finalContent = finalContent.replace("<head>", `<head>${urlPatchScript}`);
        } else {
            finalContent = urlPatchScript + finalContent;
        }

        const frame = document.createElement("iframe");
        frame.sandbox = "allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-pointer-lock allow-downloads";
        frame.allow = "autoplay; fullscreen; gamepad; pointer-lock";
        frame.srcdoc = finalContent;
        this.shadowRoot.appendChild(frame);
    }
}

customElements.define("nex-game", NexGame);
