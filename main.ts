import { Plugin, Menu, TAbstractFile, Notice } from "obsidian";
import ModalOpenPluginSettings, { DEFAULT_SETTINGS } from "./settings";
import { ModalWindow } from "./modal";
import ModalOpenSettingTab from "./settings";

export let globalLink = "";

export default class ModalOpenPlugin extends Plugin {
	settings: ModalOpenPluginSettings;
	private modal: ModalWindow | undefined;
    private draggedLink: string | null = null;
	private dragStartTime: number | null = null;
	private dragHandler: () => void;
    private middleClickHandler: () => void;

	async onload() {
		await this.loadSettings();
		this.registerOpenHandler();
		this.registerContextMenuHandler();
		this.addSettingTab(new ModalOpenSettingTab(this.app, this));
	}

	onunload() {
		if (this.dragHandler) {
			document.removeEventListener('dragstart', this.dragHandler);
			document.removeEventListener('dragend', this.dragHandler);
		}
		if (this.middleClickHandler) {
			document.removeEventListener('auxclick', this.middleClickHandler);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.registerOpenHandler(); // 添加这一行
	}

    private registerOpenHandler() {
        // 移除之前的事件监听器
        if (this.dragHandler) {
            document.removeEventListener('dragstart', this.dragHandler);
            document.removeEventListener('dragend', this.dragHandler);
        }
        if (this.middleClickHandler) {
            document.removeEventListener('auxclick', this.middleClickHandler);
        }

        if (this.settings.openMethod === "drag" || this.settings.openMethod === "both") {
            this.registerDragHandler();
        }
        if (this.settings.openMethod === "middle" || this.settings.openMethod === "both") {
            this.registerMouseMiddleClickHandler();
        }
    }

    private registerDragHandler() {
        this.dragHandler = () => {
            this.registerDomEvent(document, 'dragstart', (evt: DragEvent) => {
                const target = evt.target as HTMLElement;
                if (target.tagName === 'A' && (target.classList.contains('external-link') || target.classList.contains('internal-link'))) {
                    this.draggedLink = target.getAttribute('data-href') || target.getAttribute('href') || '';
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
        this.middleClickHandler = () => {
            this.registerDomEvent(document, 'auxclick', (evt: MouseEvent) => {
                if (evt.button === 1) { // Check for middle mouse button click
                    const target = evt.target as HTMLElement;
                    if (target.tagName === 'A' && (target.classList.contains('external-link') || target.classList.contains('internal-link'))) {
                        evt.preventDefault();
                        evt.stopImmediatePropagation(); // Prevent default behavior and stop propagation
                        const link = target.getAttribute('data-href') || target.getAttribute('href') || '';
                        this.openInFloatPreview(link);
                    }
                }
            }, { capture: true }); // 使用捕获阶段
        };

        this.middleClickHandler();
    }

	private registerContextMenuHandler() {
		// 处理文件菜单
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
				this.addFloatPreviewMenuItem(menu, file.path);
			})
		);

		// 处理 URL 菜单（包括 Markdown 链接）
		this.registerEvent(
			this.app.workspace.on("url-menu", (menu: Menu, link: string) => {
				this.addFloatPreviewMenuItem(menu, link);
			})
		);
	}

	private addFloatPreviewMenuItem(menu: Menu, link?: string) {
		menu.addItem((item) =>
			item
				.setTitle("Open in modal window")
				.setIcon("popup-open")
				.setSection("open")
				.onClick(() => {
					if (link) {
						this.openInFloatPreview(link);
					} else {
						new Notice("Unable to obtain link information");
					}
				})
		);
	}

	private async openInFloatPreview(link: string) {
		try {
			const file = this.app.metadataCache.getFirstLinkpathDest(link, "");
			this.modal = new ModalWindow(
				this,
				file ? "" : link,
				file ?? undefined,
				this.settings.modalWidth,
				this.settings.modalHeight
			);
			this.modal.open();
		} catch (error) {
			console.error("Open in modal window error:", error);
			new Notice("Open in modal window error");
		}
	}
}