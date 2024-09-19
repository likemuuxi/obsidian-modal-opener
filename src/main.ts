import { App, Plugin, Menu, TAbstractFile, Notice, TFile, MenuItem, Editor, MarkdownView, Modal } from "obsidian";
import { ModalWindow } from "./modal";
import ModalOpenSettingTab from "./settings";
import { t } from "./lang/helpers"
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
    // private currentSrcText: string | null = null;

    async onload() {
        await this.loadSettings();

        this.registerOpenHandler();
        this.registerContextMenuHandler();
        this.setupHoverListener();
        this.setupContextMenuListener();
        this.applyStyles();

        // 监听设置变化
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.applyStyles();
            })
        );

        this.registerCustomCommands();
        this.addSettingTab(new ModalOpenSettingTab(this.app, this));

        this.addCommand({
            id: 'open-in-modal-window',
            name: 'Open current tab content in modal',
            callback: () => {
                const currentFile = this.app.workspace.getActiveFile()?.path || '';
                const file = this.app.vault.getAbstractFileByPath(currentFile);
                if (!(file instanceof TFile)) {
                    return;
                }
                const app = this.app as unknown as App & { plugins: { plugins: Record<string, any> } };
                const surfPlugin = app.plugins.plugins["surfing"];
                const activeLeaf = this.app.workspace.getLeaf(false);
                
                if (!activeLeaf) {
                    return;
                }
                let linkValue = ""; // 初始化为空字符串
                if (surfPlugin) {
                    const wbFrameElement = activeLeaf.view.containerEl.querySelector('.wb-frame') as HTMLIFrameElement;
                    if (wbFrameElement) {
                        linkValue = wbFrameElement.src;
                    }
                } else {
                    const iframeElement = activeLeaf.view.containerEl.querySelector('iframe') as HTMLIFrameElement;
                    if (iframeElement) {
                        linkValue = iframeElement.src;
                    }
                }
                new ModalWindow(
                    this,
                    linkValue,
                    file,
                    "",
                    this.settings.modalWidth,
                    this.settings.modalHeight
                ).open();
            }
        });
        this.addCommand({
            id: 'open-modal-content-in-new-tab',
            name: 'Open modal content in new tab',
        });
    }

    applyStyles() {
        document.body.classList.toggle('modal-animation-enabled', this.settings.enableAnimation);
        document.body.classList.toggle('show-file-view-header', this.settings.showFileViewHeader);
        document.body.classList.toggle('show-link-view-header', this.settings.showLinkViewHeader);
        document.body.classList.toggle('show-metadata', this.settings.showMetadata);
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
        this.registerCustomCommands();
    }

    registerCustomCommands() {
        this.settings.customCommands.forEach(command => {
            this.addCommand({
                id: command.id,
                name: command.name,
                callback: () => this.executeCustomCommand(command.command)
            });
        });
    }

    executeCustomCommand(command: string) {
        if (this.isValidURL(command)) {
            this.openInFloatPreview(command);
        } else {
            if (command.includes('.canvas') || command.includes('.md') || command.includes('.excalidraw')) {
                this.openInFloatPreview(command);
            } else {
                new Notice(t("Unsupported file or link format"));
            }
        }
    }

    private removeEventListeners() {
        if (this.dragHandler) {
            document.removeEventListener('dragstart', this.dragHandler);
            document.removeEventListener('dragend', this.dragHandler);
            this.dragHandler = undefined; // Clear reference
        }
        if (this.middleClickHandler) {
            document.removeEventListener('auxclick', this.middleClickHandler, { capture: true });
            this.middleClickHandler = undefined; // Clear reference
        }
        if (this.altClickHandler) {
            document.removeEventListener('click', this.altClickHandler, { capture: true });
            this.altClickHandler = undefined; // Clear reference
        }
        if (this.contextMenuListener) {
            document.removeEventListener('contextmenu', this.contextMenuListener);
            this.contextMenuListener = undefined; // Clear reference
        }
        if (this.mouseHoverListener) {
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
            // Check if the target element is part of a link or an alias
            if (target.matches('.cn-hmd-internal-link, .cm-hmd-internal-link, .cm-link-alias, .cm-link-alias-pipe')) {
                // Initialize a variable to collect the full link text
                let linkText = '';
                let currentElement: HTMLElement | null = target;
                // Traverse backward to collect the text from the start of the link
                while (currentElement && 
                        (currentElement.matches('.cn-hmd-internal-link') ||
                        currentElement.matches('.cm-hmd-internal-link') ||
                        currentElement.matches('.cm-link-alias-pipe') ||
                        currentElement.matches('.cm-link-alias'))) {
                    linkText = currentElement.innerText + linkText;
                    currentElement = currentElement.previousElementSibling as HTMLElement;
                }
                // Exclude the alias part if it exists
                if (linkText.includes('|')) {
                    linkText = linkText.split('|')[0];
                }
                this.currentAnchor = linkText;
            }
        };
    
        document.addEventListener('mouseover', this.mouseHoverListener);
    }
    

    // private getSrcFromSpan(target: HTMLElement): string | null {
    //     return target.getAttribute('src') || null; // 返回 src 属性内容
    // }

    private setupContextMenuListener() {
        // Create a context menu listener
        this.contextMenuListener = (event: MouseEvent) => {
            const target = (event.target as HTMLElement).closest('a[data-href]');
            if (target) {
                this.currentAnchor = target.getAttribute('data-href') || target.getAttribute('href') || '';
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
                if (this.isSupportElement(target)) {
                    // Check if the target has 'nav-folder-children' or 'nav-folder' class
                    if (!target.closest('.nav-folder-children') && !target.closest('.nav-folder')) {
                        this.draggedLink = this.getLinkFromTarget(target);
                        this.dragStartTime = Date.now();
                    }
                }
            });

            this.registerDomEvent(document, 'dragend', (_evt: DragEvent) => {
                if (this.draggedLink) {
                    if (this.settings.dragThreshold === 0) {
                        this.openInFloatPreview(this.draggedLink);
                    } else if (this.dragStartTime) {
                        const dragDuration = Date.now() - this.dragStartTime;
                        if (dragDuration >= this.settings.dragThreshold) {
                            this.openInFloatPreview(this.draggedLink);
                        } else {
                            new Notice(t("Drag duration too short"));
                        }
                    }
                    this.draggedLink = null;
                    this.dragStartTime = null;
                }
            });
        };
        this.dragHandler();
    }

    private handleLinkClick(evt: MouseEvent, linkGetter: (target: HTMLElement) => string) {
        const target = evt.target as HTMLElement;
        if (this.isSupportElement(target)) {
            evt.preventDefault();
            evt.stopImmediatePropagation();
            const link = linkGetter(target);
            const isFolderLink = target.classList.contains('has-folder-note');
            const app = this.app as any;
            const folderPlugin = app.plugins.plugins["folder-notes"];
            
            if (!folderPlugin || !isFolderLink) {
                this.openInFloatPreview(link);
            } else {
                this.folderNoteOpenInFloatPreview(link);
            }
        }
    }
    private registerMouseMiddleClickHandler() {
        this.middleClickHandler = (evt: MouseEvent) => {
            if (evt.button === 1) {
                this.handleLinkClick(evt, this.getLinkFromTarget);
            }
        };
        document.addEventListener('auxclick', this.middleClickHandler, { capture: true });
    }
    
    private registerAltClickHandler() {
        this.altClickHandler = (evt: MouseEvent) => {
            if (evt.altKey && evt.button === 0) {
                this.handleLinkClick(evt, this.getLinkFromTarget);
            }
        };
        document.addEventListener('click', this.altClickHandler, { capture: true });
    }

    private registerContextMenuHandler() {
        // Handle file menu
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
                const folderTarget = this.getFolderElement(file.path); // 通过 file.path 获取对应的 DOM 元素
                const app = this.app as any;
                const folderPlugin = app.plugins.plugins["folder-notes"];
                if (folderPlugin) {
                    if (folderTarget && folderTarget.classList.contains("has-folder-note")) {
                        this.addFolderFloatMenuItem(menu, file.path);
                    } else if (!folderTarget){
                        this.addFileFloatMenuItem(menu, file.path);
                    }
                } else {
                    if (!folderTarget) {
                        this.addFileFloatMenuItem(menu, file.path);
                    }
                }
            })
        );

        // Handle URL menu (including Markdown links)
        this.registerEvent(
            this.app.workspace.on("url-menu", (menu: Menu, link: string) => {
                this.addLinkFloatMenuItem(menu, link);
            })
        );

        this.registerEvent(
            this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, view: MarkdownView) => {
                this.addCreateFileMenuItem(menu, "");
            })
        );
    }

    private addCreateFileMenuItem(menu: Menu, parentPath: string) {
        menu.addItem((item) => {
            item
                .setTitle('Create file and edit in modal')
                .setIcon('file-plus')
                .onClick(() => {
                    new Notice('Please select a file type');
                });
    
            const subMenu = (item as any).setSubmenu();
    
            subMenu.addItem((subItem: MenuItem) =>
                subItem
                    .setTitle("Markdown")
                    .setIcon("file")
                    .onClick(() => {
                        this.createFileAndEditInModal(parentPath, "md");
                    })
            );
            subMenu.addItem((subItem: MenuItem) =>
                subItem
                    .setTitle("Canvas")
                    .setIcon("layout-dashboard")
                    .onClick(() => {
                        this.createFileAndEditInModal(parentPath, "canvas");
                    })
            );
            // subMenu.addItem((subItem: MenuItem) =>
            //     subItem
            //         .setTitle("Excalidraw")
            //         .setIcon("swords")
            //         .onClick(() => {
            //             this.createFileAndEditInModal(parentPath, "excalidraw");
            //         })
            // );
            // subMenu.addItem((subItem: MenuItem) =>
            //     subItem
            //         .setTitle("Diagrams")
            //         .setIcon("pencil-ruler")
            //         .onClick(() => {
            //             this.createFileAndEditInModal(parentPath, "xml");
            //         })
            // );
            // subMenu.addItem((subItem: MenuItem) =>
            //     subItem
            //         .setTitle("Code File")
            //         .setIcon("file-code")
            //         .onClick(() => {
            //             this.createFileAndEditInModal(parentPath, "");
            //         })
            // );
        });
    }

    private async getNewFileName(parentPath: string, fileType: string): Promise<{ fileName: string, isEmbed: boolean } | null> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const selectedText = activeView?.editor?.getSelection() || '';
    
        return new Promise((resolve) => {
            const modal = new Modal(this.app);
            modal.titleEl.setText(`Enter new ${fileType} file name`);
            
            const container = modal.contentEl.createDiv({ cls: 'new-file-modal-container' });
    
            const inputContainer = container.createDiv({ cls: 'new-file-input-container' });
    
            const input = inputContainer.createEl("input", { 
                type: "text", 
                value: selectedText,
                placeholder: "File name",
                cls: 'new-file-input'
            });
            input.focus();
            input.select();
    
            const select = inputContainer.createEl("select", { cls: 'new-file-select' });
            select.createEl("option", { text: "wikilink", value: "wikilink" });
            select.createEl("option", { text: "embed", value: "embed" });
    
            const buttonContainer = container.createDiv({ cls: 'new-file-button-container' });
    
            const confirmButton = buttonContainer.createEl("button", { 
                text: "Confirm", 
                cls: 'new-file-button confirm'
            });
            const cancelButton = buttonContainer.createEl("button", { 
                text: "Cancel", 
                cls: 'new-file-button'
            });
    
            confirmButton.onclick = () => {
                const fileName = input.value.trim();
                if (fileName) {
                    resolve({
                        fileName: fileName,
                        isEmbed: select.value === "embed"
                    });
                    modal.close();
                }
            };
    
            cancelButton.onclick = () => {
                resolve(null);
                modal.close();
            };
            modal.open();
        });
    }
    
    private insertLinkToActiveFile(filePath: string, displayName: string, isEmbed: boolean) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            const editor = activeView.editor;
            const selection = editor.getSelection();
            const linkText = isEmbed ? `![[${filePath}|${displayName}]]` : `[[${filePath}|${displayName}]]`;
            if (selection) {
                const from = editor.getCursor("from");
                const to = editor.getCursor("to");
                editor.replaceRange(linkText, from, to);
            } else {
                const cursor = editor.getCursor();
                editor.replaceRange(linkText, cursor);
            }
        }
    }
    
    private async createFileAndEditInModal(parentPath: string, fileType: string) {
        const result = await this.getNewFileName(parentPath, fileType);
        if (!result) return;
    
        const { fileName, isEmbed } = result;
        // let newFilePath = fileName.includes('/') ? fileName : `${parentPath}/${fileName}`;
        let newFilePath = fileName;
        if (!newFilePath.endsWith(`.${fileType}`)) {
            newFilePath += `.${fileType}`;
        }
    
        try {
            const newFile = await this.app.vault.create(newFilePath, '');
    
            new ModalWindow(
                this,
                "",
                newFile,
                "",
                this.settings.modalWidth,
                this.settings.modalHeight
            ).open();

            const displayName = newFile.basename;

            this.insertLinkToActiveFile(newFilePath, displayName, isEmbed);
        } catch (error) {
            console.error("Failed to create file:", error);
            new Notice(`Failed to create file: ${error.message}`);
        }
    }

    private addFloatMenuItem(menu: Menu, link: string, title: string, onClick: () => void) {
        menu.addItem((item) =>
            item
                .setTitle(title)
                .setIcon("popup-open")
                .setSection("open")
                .onClick(onClick)
        );
    }

    private getFolderElement(filePath: string): HTMLElement | null {
        return document.querySelector(`.nav-folder-title[data-path="${filePath}"]`);
    }

    private addFileFloatMenuItem(menu: Menu, link?: string) {
        this.addFloatMenuItem(menu, link || '', t("Open in Modal Window"), () => {
            if (link) {
                this.openInFloatPreview(this.currentAnchor || link);
            }
        });
    }
    
    private addFolderFloatMenuItem(menu: Menu, link?: string) {
        this.addFloatMenuItem(menu, link || '', t("Open in Modal Window"), () => {
            if (link) {
                this.folderNoteOpenInFloatPreview(link);
            }
        });
    }
    
    private addLinkFloatMenuItem(menu: Menu, link?: string) {
        this.addFloatMenuItem(menu, link || '', t("Open in Modal Window"), () => {
            if (link) {
                this.openInFloatPreview(link);
            }
        });
    }

    private async openInFloatPreview(link: string) {
        try {
            // 适配 auto content tco
            if (link?.startsWith('#')) {
                const currentFilePath = this.app.workspace.getActiveFile()?.path || '';
                link = currentFilePath + link;
            }

            // console.log("OpenLink:", link);

            const [filePath, fragment] = link.split(/[#]/);
            const abstractFile = this.app.metadataCache.getFirstLinkpathDest(filePath, "");
            let file: TFile | undefined;

            if (abstractFile instanceof TFile) {
                file = abstractFile;
            } else {
                file = undefined;
            }
            
            // 检测文件是否存在
            if (!file && !this.isValidURL(link)) {
                new Notice(t("The file does not exist: ") + filePath);
                return;
            }

            // 处理网络链接
            new ModalWindow(
                this,
                this.isValidURL(link) ? link : "",
                file,
                fragment ?? "",
                this.settings.modalWidth,
                this.settings.modalHeight
            ).open();
            this.currentAnchor = null;
        } catch (error) {
            new Notice(t("Open in modal window error"));
        }
    }

    private async folderNoteOpenInFloatPreview(link: string) {
        try {
            if (this.modal) {
                this.modal.close();
            }

            let file: TFile | undefined;
            const fileNameOnly = link.split(/[/\\]/).pop() || link; // 获取文件名部分
            let abstractFile = this.app.vault.getAbstractFileByPath(`${link}/${fileNameOnly}.md`);
            
            if (abstractFile instanceof TFile) {
                file = abstractFile;
            } else {
                // 尝试查找 .canvas 文件
                abstractFile = this.app.vault.getAbstractFileByPath(`${link}/${fileNameOnly}.canvas`);
                if (abstractFile instanceof TFile) {
                    file = abstractFile;
                } else {
                    // 通过 metadataCache 查找匹配的文件
                    const possibleFile = this.app.metadataCache.getFirstLinkpathDest(fileNameOnly, "");
                    if (possibleFile instanceof TFile) {
                        file = possibleFile;
                    }
                }
            }
            
            // 处理网络链接
            new ModalWindow(
                this,
                "",
                file,
                "",
                this.settings.modalWidth,
                this.settings.modalHeight
            ).open();
        } catch (error) {
            new Notice(t("Open in modal window error"));
        }
    }

    private isSupportElement(target: HTMLElement): boolean {
        return target.tagName === 'A' && (target.classList.contains('external-link') || target.classList.contains('internal-link'))
            || target.classList.contains('auto-card-link-card') || target.classList.contains('recent-files-title-content')
            || target.classList.contains('has-folder-note') || target.classList.contains("homepage-button");
    }

    private getLinkFromTarget(target: HTMLElement): string {
        return target.getAttribute('data-href') || target.getAttribute('href') || target.getAttribute('data-path') || target.textContent?.trim() || '';
    }

    private isValidURL = (url: string) => 
        ['http://', 'https://', 'www.', '192.', '127.'].some(prefix => url.startsWith(prefix));
}
