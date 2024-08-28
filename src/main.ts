import { Plugin, Menu, TAbstractFile, Notice, TFile } from "obsidian";
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
    private currentAnchor: string | null = null;

	async onload() {
		await this.loadSettings();
		this.registerOpenHandler();
		this.registerContextMenuHandler();
		this.addSettingTab(new ModalOpenSettingTab(this.app, this));

		// 初始化时应用样式
		this.applyModalStyle();

		// 监听设置变化
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.applyModalStyle();
			})
		);

        this.setupClickListener();
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
        // 确保在移除事件监听器之前检查是否已注册
        if (this.dragHandler) {
            console.log("Removing drag event handlers");
            document.removeEventListener('dragstart', this.dragHandler);
            document.removeEventListener('dragend', this.dragHandler);
            this.dragHandler = undefined; // 清除引用
        }
        if (this.middleClickHandler) {
            console.log("Removing middle click event handler");
            document.removeEventListener('auxclick', this.middleClickHandler, { capture: true });
            this.middleClickHandler = undefined; // 清除引用
        }
        if (this.altClickHandler) {
            console.log("Removing alt click event handler");
            document.removeEventListener('click', this.altClickHandler, { capture: true });
            this.altClickHandler = undefined; // 清除引用
        }
    }

    private registerOpenHandler() {
        // 移除之前的事件监听器
		this.removeEventListeners();

        // 根据设置的打开方式注册相应的事件处理器
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

    private setupClickListener() {
        document.addEventListener('auxclick', (event: MouseEvent) => {
            // 查找最近的含有 data-href 属性的元素
            const target = (event.target as HTMLElement).closest('[data-href]');
            if (target) {
                // 获取 data-href 属性的值
                this.currentAnchor = target.getAttribute('data-href');
                console.log("Clicked anchor:", this.currentAnchor);
            } else {
                this.currentAnchor = null;
            }
        });
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

        console.log("Adding middle click event handler");
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

        console.log("Adding alt click event handler");
        document.addEventListener('click', this.altClickHandler, { capture: true });
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
    
    private async openInFloatPreview(link: string) {
        try {
            const [fileName, fragment] = link.split(/[#]/);
            console.log("link:", link);
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
        } catch (error) {
            console.error("Open in modal window error:", error);
            new Notice("Open in modal window error");
        }
    }
}
