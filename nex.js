(() => {
    const ASSET_DISTRIBUTION_NETWORK_URL = "https://nxyderrr-assets.pages.dev/";

    window.nex = new Proxy({}, {
        get(registryMap, gameIdentifier) {
            if (!registryMap[gameIdentifier]) {
                registryMap[gameIdentifier] = {
                    _earlyListeners: {},
                    _element: null,
                    _earlyStartRequested: false,
                    on(eventName, eventCallback) {
                        if (this._element) {
                            this._element._registerListener(eventName, eventCallback);
                        } else {
                            if (!this._earlyListeners[eventName]) {
                                this._earlyListeners[eventName] = [];
                            }
                            this._earlyListeners[eventName].push(eventCallback);
                        }
                    },
                    start() {
                        if (this._element) {
                            this._element.start();
                        } else {
                            this._earlyStartRequested = true;
                        }
                    }
                };
            }
            return registryMap[gameIdentifier];
        }
    });

    class NexGame extends HTMLElement {
        static get observedAttributes() { return ["alias", "gid"]; }
        
        constructor() {
            super();
            this._gameHtmlContent = "";
            this._registeredListeners = {};
            this._isComponentValid = true;
            this._executionPending = false;
            this.attachShadow({ mode: "open" });
        }

        get alias() { return this.getAttribute("alias"); }
        get gid() { return this.getAttribute("gid"); }

        connectedCallback() {
            this.shadowRoot.innerHTML = `<style>:host{display:block;width:100%;height:100%;background:#000;position:relative}iframe{width:100%;height:100%;border:0;display:block}</style>`;
            
            if (!this.gid) return;

            const gameRegistry = window.nex[this.gid];

            if (gameRegistry._element) {
                this._isComponentValid = false;
                console.error(`[NEX ERROR] gID "${this.gid}" already in use.`);
                this.shadowRoot.innerHTML = `<style>:host{display:block;background:#300;color:#fff;padding:10px}</style><div>[NEX ERROR] Duplicate gID: ${this.gid}</div>`;
                return;
            }

            gameRegistry._element = this;

            if (gameRegistry._earlyStartRequested) {
                this._executionPending = true;
                delete gameRegistry._earlyStartRequested;
            }

            if (gameRegistry._earlyListeners) {
                for (const eventName in gameRegistry._earlyListeners) {
                    gameRegistry._earlyListeners[eventName].forEach(eventCallback => {
                        this._registerListener(eventName, eventCallback);
                    });
                }
                delete gameRegistry._earlyListeners;
            }

            if (this.alias) {
                if (document.readyState === "loading") {
                    document.addEventListener("DOMContentLoaded", () => this.initializeGameFetch());
                } else {
                    setTimeout(() => this.initializeGameFetch(), 0);
                }
            }
        }

        disconnectedCallback() {
            if (this._isComponentValid && this.gid && window.nex[this.gid]) {
                delete window.nex[this.gid];
            }
        }

        _registerListener(eventName, eventCallback) {
            if (!this._registeredListeners[eventName]) {
                this._registeredListeners[eventName] = [];
            }
            this._registeredListeners[eventName].push(eventCallback);
        }

        _dispatchInternalEvent(eventName, eventData = {}) {
            if (!this._isComponentValid) return;
            if (this._registeredListeners[eventName]) {
                this._registeredListeners[eventName].forEach(eventCallback => eventCallback(eventData));
            }
        }

        async initializeGameFetch() {
            if (!this._isComponentValid) return;
            try {
                this._dispatchInternalEvent("progress", { progress: 5 });
                
                const manifestResponse = await fetch(`${ASSET_DISTRIBUTION_NETWORK_URL}game_list.json`);
                const manifestData = await manifestResponse.json();
                
                const chunkedAssets = manifestData[0] || [];
                const streamedAssets = manifestData[1] || [];

                if (streamedAssets.includes(this.alias)) {
                    this._dispatchInternalEvent("progress", { progress: 30 });
                    const standaloneResponse = await fetch(`${ASSET_DISTRIBUTION_NETWORK_URL}external/${this.alias}.html`);
                    this._gameHtmlContent = await standaloneResponse.text();
                } 
                else if (chunkedAssets.includes(this.alias)) {
                    const totalChunksResponse = await fetch(`${ASSET_DISTRIBUTION_NETWORK_URL}${this.alias}/nr.txt`);
                    const totalChunksCount = parseInt(await totalChunksResponse.text(), 10);

                    for (let currentChunkIndex = 1; currentChunkIndex <= totalChunksCount; currentChunkIndex++) {
                        const chunkResponse = await fetch(`${ASSET_DISTRIBUTION_NETWORK_URL}${this.alias}/src.part${currentChunkIndex}.html`);
                        this._gameHtmlContent += await chunkResponse.text();
                        
                        const calculatedProgress = Math.floor(10 + (currentChunkIndex / totalChunksCount) * 85);
                        this._dispatchInternalEvent("progress", { progress: calculatedProgress });
                    }
                } else {
                    throw new Error("Game not found in manifest");
                }

                this._dispatchInternalEvent("progress", { progress: 100 });
                this._dispatchInternalEvent("ready");

                if (this._executionPending) {
                    this.start();
                }
            } catch (fetchError) {
                this._dispatchInternalEvent("error", { message: fetchError.message });
            }
        }

        start() {
            if (!this._isComponentValid) return;
            if (this.shadowRoot.querySelector("iframe")) return;

            if (!this._gameHtmlContent) {
                this._executionPending = true;
                return;
            }

            const gameViewportFrame = document.createElement("iframe");
            gameViewportFrame.sandbox = "allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-pointer-lock allow-downloads";
            gameViewportFrame.allow = "autoplay; fullscreen; gamepad; pointer-lock";
            
            this.shadowRoot.appendChild(gameViewportFrame);

            const frameDocument = gameViewportFrame.contentDocument || gameViewportFrame.contentWindow.document;
            frameDocument.open();
            frameDocument.write(this._gameHtmlContent);
            frameDocument.close();
        }
    }

    customElements.define("nex-game", NexGame);
})();
