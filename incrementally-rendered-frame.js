
const styles = `
* {
	box-sizing: border-box;
}

:host {
	display: block;
}

iframe {
	border-width: 1px;
	border-style: solid;
	border-color: tomato;
	width: 100%;
	height: 100%;
}

#apps {
	font-family: 'Proxima Nova Soft', 'Helvetica Neue', sans-serif;
	display: flex;
	height: 100%;
}

.app {
	flex: 1;
	margin: 5px;
	position: relative;
}

.app .label {
	position: absolute;
	top: 8px;
	right: 8px;
	background: rgba(0, 0, 0, 0.25);
	padding: 4px 8px;
}
`;

const template = document.createElement("template");
template.innerHTML = `
	<main id="apps">
		<div class="app">
			<span class="label">Source</span>
			<iframe id="doc1"></iframe>
		</div>
		<div class="app">
			<span class="label">Destination</span>
			<iframe id="doc2"></iframe>
		</div>
	</main>
`;

class IncrementallyRenderedFrame extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
	}
	connectedCallback() {
		let doc = this.ownerDocument;
		let frag = doc.importNode(template.content, true);
		let style = doc.createElement('style');
		style.textContent = styles;
		frag.insertBefore(style, frag.firstChild);

		if(this.src) {
			frag.querySelector('#doc1').setAttribute('src', this.src);
			this.shadowRoot.appendChild(frag);
			this._setupWhenReady();
		}
	}

	get src() {
		return this.getAttribute('src');
	}

	get omitLog() {
		return this.hasAttribute('omit-log');
	}

	async _setupWhenReady() {
		let steal = window.steal;
		let p;
		if(steal) {
			p = steal.import("done-mutation/encoder", "done-mutation/patch", "done-mutation/log");
		} else {
			// Import from unpkg?
			p = Promise.resolve();
		}

		let modules = await p;
		this._setup.apply(this, modules);
	}

	_setup(MutationEncoder, MutationPatcher, log) {
		this._cloneIframe();

		// Logging is on by default by can be disabled with the omit-log attribute.
		if(!this.omitLog) {
			log.element(this._sourceDoc);
		}

		let encoder = new MutationEncoder(this._sourceDoc);
		let patcher = new MutationPatcher(this._cloneDoc);

		new MutationObserver(records => {
			let bytes = Uint8Array.from(encoder.mutations(records));
			patcher.patch(bytes);
		}).observe(this._sourceDoc, {
			characterData: true,
			childList: true,
			subtree: true,
			attributes: true
		});

		this._sourceDoc.addEventListener("change", ev => {
			let bytes = encoder.encodeEvent(ev);
			patcher.patch(bytes);
		});
	}

	_cloneIframe() {
		let root = this.shadowRoot;
		this._sourceDoc = root.querySelector("#doc1").contentDocument;
		this._cloneDoc = root.querySelector("#doc2").contentDocument;
		this._cloneDoc.documentElement.replaceWith(
			importClone(this._sourceDoc.documentElement, this._cloneDoc)
		);

		// Add the doctype
		if(this._sourceDoc.firstChild.nodeType === 10) {
			let clone = this._sourceDoc.firstChild.cloneNode();
			this._cloneDoc.insertBefore(clone, this._cloneDoc.documentElement);
		}
	}
}

customElements.define("incrementally-rendered-frame", IncrementallyRenderedFrame);

function importClone(node, document) {
	let clone = document.importNode(node, true);
	let scripts = clone.getElementsByTagName("script");
	for(let script of scripts) {
		script.removeAttribute("src");
		let child = script.firstChild;
		while(child) {
			child.nodeValue = "";
			child = child.nextSibling;
		}
	}
	return clone;
}
