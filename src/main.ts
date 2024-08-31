import { Plugin, Menu, TAbstractFile, Notice } from "obsidian";
import { ModalWindow } from "./modal";
import ModalOpenSettingTab from "./settings";
import ModalOpenPluginSettings, { DEFAULT_SETTINGS } from "./settings";

export default class ModalOpenPlugin extends Plugin {
	settings: ModalOpenPluginSettings;
	private modal: ModalWindow | undefined;
    private draggedLink: string | null = null;
	private dragStartTime: number | null = null;
    private dragHandler: (() => void) | undefined;
    private middleClickHandler: ((evt: MouseEvent) => void) | undefined;
    private altClickHandler: ((evt: MouseEvent) => void) | undefined;
    private contextMenuListener: ((event: MouseEvent) => void) | undefined;
    private mouseHoverListener: ((event: MouseEvent) => void) | undefined;
    private currentAnchor: string | null = null;

	async onload() {
		await this.loadSettings();
        
		this.registerOpenHandler();
        this.registerContextMenuHandler();
        this.setupHoverListener();
        this.setupContextMenuListener();

 
		this.addSettingTab(new ModalOpenSettingTab(this.app, this));

		// 初始化时应用样式
		this.applyModalStyle();

		// 监听设置变化
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.applyModalStyle();
			})
		);
	}

	onunload() {
		this.removeEventListeners();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.registerOpenHandler();
	}

	applyModalStyle() {
        document.body.classList.toggle('modal-animation-enabled', this.settings.enableAnimation);
    }

    private removeEventListeners() {
        if (this.dragHandler) {
            console.log("Removing drag event handlers");
            document.removeEventListener('dragstart', this.dragHandler);
            document.removeEventListener('dragend', this.dragHandler);
            this.dragHandler = undefined; // Clear reference
        }
        if (this.middleClickHandler) {
            console.log("Removing middle click event handler");
            document.removeEventListener('auxclick', this.middleClickHandler, { capture: true });
            this.middleClickHandler = undefined; // Clear reference
        }
        if (this.altClickHandler) {
            console.log("Removing alt click event handler");
            document.removeEventListener('click', this.altClickHandler, { capture: true });
            this.altClickHandler = undefined; // Clear reference
        }
        if (this.contextMenuListener) {
            console.log("Removing context menu event handler");
            document.removeEventListener('contextmenu', this.contextMenuListener);
            this.contextMenuListener = undefined; // Clear reference
        }
        if (this.mouseHoverListener) {
            console.log("Removing mouse hover event handler");
            document.removeEventListener('mouseover', this.mouseHoverListener);
            this.mouseHoverListener = undefined; // Clear reference
        }
    }

    private registerOpenHandler() {
        // Remove previous event listeners
		this.removeEventListeners();

        // Register new event handlers based on settings
        if (this.settings.openMethod === "drag" || this.settings.openMethod === "both") {
            this.registerDragHandler();
        }
        if (this.settings.openMethod === "middle" || this.settings.openMethod === "both") {
            this.registerMouseMiddleClickHandler();
        }
        if (this.settings.openMethod === "altClick" || this.settings.openMethod === "both") {
            this.registerAltClickHandler();
        }
    }
    
    private setupHoverListener() {
        // Create a hover listener
        this.mouseHoverListener = (event: MouseEvent) => {
            // Get the hovered target element
            const target = event.target as HTMLElement;

            // Check if the target element is a link with the cm-underline class
            if (target.matches('.cm-underline, .cm-hmd-internal-link')) {
                // Get the link text content
                const linkText = target.innerText;
                this.currentAnchor = linkText;
                console.log("Hovered link text:", this.currentAnchor);
            }
        };
        // if (target.matches('.cm-hmd-internal-link.cm-link-alias')) { 
        //     // Get the link text content from cm-hmd-internal-link.cm-link-alias
        //     const linkText = target.innerText;
        //     this.currentAnchor = linkText;
        //     console.log("Hovered link text:", this.currentAnchor);
        // } else if (target.matches('.cm-underline, .cm-hmd-internal-link')) { 
        //     // Get the link text content from cm-underline or cm-hmd-internal-link
        //     const linkText = target.innerText;
        //     this.currentAnchor = linkText;
        //     console.log("Hovered link text:", this.currentAnchor);
        // }
        document.addEventListener('mouseover', this.mouseHoverListener);
    }

    private setupContextMenuListener() {
        // Create a context menu listener
        this.contextMenuListener = (event: MouseEvent) => {
            const target = (event.target as HTMLElement).closest('a[data-href]');
            if (target) {
                this.currentAnchor = target.getAttribute('data-href') || target.getAttribute('href') || '';
                console.log("Right-clicked anchor:", this.currentAnchor);
            } else {
                this.currentAnchor = null;
            }
        };

        document.addEventListener('contextmenu', this.contextMenuListener);
    }

    private registerDragHandler() {
        this.dragHandler = () => {
            this.registerDomEvent(document, 'dragstart', (evt: DragEvent) => {
                const target = evt.target as HTMLElement;
                if (target.tagName === 'A' && (target.classList.contains('external-link') || target.classList.contains('internal-link'))) {
                    this.draggedLink = target.getAttribute('data-href') || target.getAttribute('href') || '';
                    if (this.draggedLink?.startsWith('#')) {
                        const currentFilePath = this.app.workspace.getActiveFile()?.path || '';
                        console.log("currentFilePath", currentFilePath)
                        this.draggedLink = currentFilePath + this.draggedLink;
                    }
                    this.dragStartTime = Date.now();
                    console.log("Drag started on link:", this.draggedLink);
                }
            });

            this.registerDomEvent(document, 'dragend', (evt: DragEvent) => {
                if (this.draggedLink) {
                    if (this.settings.dragThreshold === 0) {
                        console.log("Opening link immediately:", this.draggedLink);
                        this.openInFloatPreview(this.draggedLink);
                    } else if (this.dragStartTime) {
                        const dragDuration = Date.now() - this.dragStartTime;
                        console.log("Drag ended, duration:", dragDuration);
                        if (dragDuration >= this.settings.dragThreshold) {
                            console.log("Opening link:", this.draggedLink);
                            this.openInFloatPreview(this.draggedLink);
                        } else {
                            console.log("Drag duration too short, not opening link");
                        }
                    }
                    this.draggedLink = null;
                    this.dragStartTime = null;
                }
            });
        };

        this.dragHandler();
    }

    private registerMouseMiddleClickHandler() {
        this.middleClickHandler = (evt: MouseEvent) => {
            if (evt.button === 1) { // Check for middle mouse button click
                const target = evt.target as HTMLElement;
                if (target.tagName === 'A' && (target.classList.contains('external-link') || target.classList.contains('internal-link'))) {
                    evt.preventDefault();
                    evt.stopImmediatePropagation(); // Prevent default behavior and stop propagation
                    const link = target.getAttribute('data-href') || target.getAttribute('href') || '';
                    this.openInFloatPreview(link);
                }
            }
        };

        // console.log("Adding middle click event handler");
        document.addEventListener('auxclick', this.middleClickHandler, { capture: true });
    }

    private registerAltClickHandler() {
        this.altClickHandler = (evt: MouseEvent) => {
            if (evt.altKey && evt.button === 0) { // Check for Alt + Left mouse button click
                const target = evt.target as HTMLElement;
                if (target.tagName === 'A' && (target.classList.contains('external-link') || target.classList.contains('internal-link'))) {
                    evt.preventDefault();
                    evt.stopImmediatePropagation(); // Prevent default behavior and stop propagation
                    const link = target.getAttribute('data-href') || target.getAttribute('href') || '';
                    this.openInFloatPreview(link);
                }
            }
        };

        // console.log("Adding alt click event handler");
        document.addEventListener('click', this.altClickHandler, { capture: true });
    }

	private registerContextMenuHandler() {
		// Handle file menu
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
				this.addFileFloatMenuItem(menu, file.path);
			})
		);

		// Handle URL menu (including Markdown links)
		this.registerEvent(
			this.app.workspace.on("url-menu", (menu: Menu, link: string) => {
				this.addLinkFloatMenuItem(menu, link);
			})
		);
	}

    private addFileFloatMenuItem(menu: Menu, link?: string) {
        menu.addItem((item) =>
            item
                .setTitle("Open in Modal Window")
                .setIcon("popup-open")
                .setSection("open")
                .onClick(() => {
                    if (link) {
                        if (this.currentAnchor) {
                            this.openInFloatPreview(this.currentAnchor);
                        } else {
                            this.openInFloatPreview(link);
                        }
                    }
                })
        );
    }

    private addLinkFloatMenuItem(menu: Menu, link?: string) {
        menu.addItem((item) =>
            item
                .setTitle("Open in Modal Window")
                .setIcon("popup-open")
                .setSection("open")
                .onClick(() => {
                    if (link) {
                        this.openInFloatPreview(link);
                    }
                })
        );
    }

    private async openInFloatPreview(link: string) {
        try {
            console.log("OpenLink:", link);
            
            const [fileName, fragment] = link.split(/[#]/);
            // console.log("Original fileName:", fileName);
            // console.log("Fragment:", fragment);
            
            const file = this.app.metadataCache.getFirstLinkpathDest(fileName, "");
            // console.log("File from metadata cache:", file);
            
            this.modal = new ModalWindow(
                this,
                file ? "" : link,
                file ?? undefined,
                fragment ?? "",
                this.settings.modalWidth,
                this.settings.modalHeight
            );
            this.modal.open();
            this.currentAnchor = null;
        } catch (error) {
            console.error("Open in modal window error:", error);
            new Notice("Open in modal window error");
        }
    }
}
