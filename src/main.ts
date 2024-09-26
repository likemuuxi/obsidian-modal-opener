import { App, Plugin, Menu, TAbstractFile, Notice, TFile, MenuItem, Editor, MarkdownView, Modal, EditorPosition, WorkspaceLeaf } from "obsidian";
import { ModalWindow } from "./modal";
import ModalOpenerSettingTab from "./settings";
import { t } from "./lang/helpers"
import ModalOpenerPluginSettings, { DEFAULT_SETTINGS } from "./settings";

export type RealLifeWorkspaceLeaf = WorkspaceLeaf & {
    activeTime: number;
    history: {
      back: () => void;
      backHistory: any[];
    };
    id: string;
    pinned: boolean;
    parent: { id: string };
  };

export default class ModalOpenerPlugin extends Plugin {
    settings: ModalOpenerPluginSettings;
    private draggedLink: string | null = null;
    private dragStartTime: number | null = null;
    private dragHandler: (() => void) | undefined;
    private middleClickHandler: ((evt: MouseEvent) => void) | undefined;
    private altClickHandler: ((evt: MouseEvent) => void) | undefined;
    private contextMenuListener: ((event: MouseEvent) => void) | undefined;
    private mouseHoverListener: ((event: MouseEvent) => void) | undefined;
    private currentAnchor: string | null = null;
    static activeModalWindow: ModalWindow | null = null;
    private processors: Map<string, Promise<void>> = new Map();


    async onload() {
        await this.loadSettings();

        this.registerOpenHandler();
        this.registerContextMenuHandler();
        this.setupHoverListener();
        this.setupContextMenuListener();
        this.applyStyles();
        this.registerCustomCommands();
        this.addSettingTab(new ModalOpenerSettingTab(this.app, this));

        // 监听设置变化
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.applyStyles();
            })
        );

        this.app.workspace.onLayoutReady(() => {
            this.registerEvent(
                this.app.workspace.on("active-leaf-change", this.onActiveLeafChange.bind(this))
            );
        });

        this.addCommand({
            id: 'open-in-modal-window',
            name: 'Open current tab content in modal',
            callback: () => this.openCurrentContentInModal()
        });
        this.addCommand({
            id: 'duplicate-in-modal-window',
            name: 'Duplicate current tab content in modal',
            callback: () => this.duplicateCurrentContentInModal()
        });
        this.addCommand({ // This command binds the shortcut key in the bindHotkey() function of modal.ts and defines the functionality in the openInNewTab() function
            id: 'open-modal-content-in-new-tab',
            name: 'Open modal content in new tab',
            callback: () => {
                if (ModalOpenerPlugin.activeModalWindow) {
                    ModalOpenerPlugin.activeModalWindow.openInNewTab();
                } else {
                    new Notice(t("No active modal window"));
                }
            }
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

    private openContentInModal(shouldDetach: boolean = false) {
        const currentFile = this.app.workspace.getActiveFile()?.path || '';
        const file = this.app.vault.getAbstractFileByPath(currentFile);
        if (!(file instanceof TFile)) {
            return;
        }
        
        const activeLeaf = this.app.workspace.getLeaf(false);
        if (!activeLeaf) {
            return;
        }
        
        const surfPlugin = (this.app as any).plugins.plugins["surfing"];
        const frameSelector = surfPlugin ? '.wb-frame' : 'iframe';
        const frameElement = activeLeaf.view.containerEl.querySelector(frameSelector) as HTMLIFrameElement;
        const linkValue = frameElement?.src || "";
        
        new ModalWindow(
            this,
            linkValue,
            file,
            "",
            this.settings.modalWidth,
            this.settings.modalHeight
        ).open();
        
        if (shouldDetach) {
            activeLeaf.detach();
        }
    }
    
    private openCurrentContentInModal() {
        this.openContentInModal(true);
    }

    private duplicateCurrentContentInModal() {
        this.openContentInModal(false);
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
                let parentPath = "";
                if (view.file && view.file.parent) {
                    parentPath = view.file.parent.path;
                }
                this.addCreateFileMenuItem(menu, parentPath);
            })
        );
    }

    private addCreateFileMenuItem(menu: Menu, parentPath: string) {
        menu.addItem((item) => {
            item
                .setTitle(t('Create and edit in modal'))
                .setIcon('file-plus')

            const subMenu = (item as any).setSubmenu();
    
            subMenu.addItem((subItem: MenuItem) =>
                subItem
                    .setTitle("Markdown")
                    .setIcon("file")
                    .onClick(() => {
                        this.createFileAndEditInModal(parentPath, "md");
                    })
            );

            const canvasPlugin = (this.app as any).internalPlugins.getEnabledPluginById("canvas");
            if (canvasPlugin) {
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Canvas")
                        .setIcon("layout-dashboard")
                        .onClick(() => {
                            this.createFileAndEditInModal(parentPath, "canvas");
                        })
                );
            }
            const excalidrawPlugin = this.getPlugin("obsidian-excalidraw-plugin");
            if (excalidrawPlugin) {
                subMenu.addSeparator();
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Excalidraw")
                        .setIcon("swords")
                        .onClick(async () => {
                            const initialLeafCount = this.app.workspace.getLeavesOfType('excalidraw').length;
                            (this.app as any).commands.executeCommandById("obsidian-excalidraw-plugin:excalidraw-autocreate-and-embed-new-tab");
                            const waitForNewLeaf = () => {
                                return new Promise<void>((resolve) => {
                                    const checkLeaf = () => {
                                        const currentLeafCount = this.app.workspace.getLeavesOfType('excalidraw').length;
                                        if (currentLeafCount > initialLeafCount) {
                                            resolve();
                                        } else {
                                            setTimeout(checkLeaf, 50);
                                        }
                                    };
                                    checkLeaf();
                                });
                            };
    
                            await waitForNewLeaf();
                            setTimeout(() => {
                                this.openCurrentContentInModal();
                            }, 150);

                            // await this.createFileAndInsertLink("obsidian-excalidraw-plugin:excalidraw-autocreate-on-current");
                        })
                );
            }
            const diagramsPlugin = this.getPlugin("obsidian-diagrams-net");
            if (diagramsPlugin) {
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Diagrams")
                        .setIcon("pencil-ruler")
                        .onClick(() => {
                            (this.app as any).commands.executeCommandById("obsidian-diagrams-net:app:diagrams-net-new-diagram");
                        })
                );
            }
            subMenu.addSeparator();
            const excelPlugin = this.getPlugin("excel");
            if (excelPlugin) {
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Excel")
                        .setIcon("table")
                        .onClick(async () => {
                            await this.createFileAndInsertLink("excel:excel-autocreate");
                        })
                );
            }
            const SheetPlugin = this.getPlugin("sheet-plus");
            if (SheetPlugin) {
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Sheet Plus")
                        .setIcon("grid")
                        .onClick(async () => {
                            await this.createFileAndInsertLink("sheet-plus:spreadsheet-autocreation");
                        })
                );
            }
            
            const vscodePlugin = this.getPlugin("vscode-editor");
            const codePlugin = this.getPlugin("code-files");
            if (vscodePlugin || codePlugin) {
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Code File")
                        .setIcon("file-code")
                        .onClick(async () => {
                            await this.createCodeFileAndOpenInModal();
                        })
                );
            }
            
            const markmindPlugin = this.getPlugin("obsidian-markmind");
            if (markmindPlugin) {
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("MarkMind")
                        .setIcon("brain-circuit")
                        .onClick(async () => {
                            await this.createFileAndInsertLink("obsidian-markmind:Create New MindMap");
                        })
                );
            }
        });
    }

    private async createFileAndInsertLink(commandId: string) {
        // 保存当前活动编辑器的信息
        const previousView = this.app.workspace.getActiveViewOfType(MarkdownView);
    
        let previousEditor: Editor | null = null;
        let previousCursor: EditorPosition | null = null;
    
        if (previousView) {
            previousEditor = previousView.editor;
            previousCursor = previousEditor.getCursor();
        }
    
        const newLeaf = this.app.workspace.getLeaf(true);
        this.app.workspace.setActiveLeaf(newLeaf, { focus: true });
    
        (this.app as any).commands.executeCommandById(commandId);
    
        const activeFile = await this.waitForActiveFile();
    
        if (activeFile && previousEditor && previousCursor) {
            const fileName = activeFile.name;
            const filePath = activeFile.path;
            const linkText = `[[${filePath}|${fileName}]]`;
            
            if (previousView) {
                this.app.workspace.setActiveLeaf(previousView.leaf, { focus: true });
                previousEditor?.replaceRange(linkText, previousCursor);
            }
    
            // 移动光标到插入的链接之后
            const newCursor = {
                line: previousCursor.line,
                ch: previousCursor.ch + linkText.length
            };
            previousEditor.setCursor(newCursor);
            this.app.workspace.setActiveLeaf(newLeaf, { focus: true });
        }
        this.openCurrentContentInModal();
    }

    private async waitForActiveFile(timeout: number = 5000): Promise<TFile | null> {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                return activeFile;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return null;
    }

    private async createCodeFileAndOpenInModal() {
        return new Promise<void>((resolve) => {
            let fileName = '';
            let fileExtension = '';
    
            const observer = new MutationObserver((mutations, obs) => {
                for (const mutation of mutations) {
                    for (const node of Array.from(mutation.addedNodes)) {
                        if (node instanceof HTMLElement) {
                            if (node.classList.contains('modal-container')) {
                                const confirmButton = node.querySelector('.mod-cta');
                                const inputElement = node.querySelector('input');
                                let selectElement = node.querySelector('.modal_select') as HTMLSelectElement;
                                const codePlugin = this.getPlugin("code-files");
                                if (codePlugin) {
                                    selectElement = node.querySelector('.dropdown') as HTMLSelectElement;
                                }
                                
                                if (confirmButton && inputElement && selectElement) {
                                    
                                    // 监听输入框的变化
                                    inputElement.addEventListener('input', () => {
                                        fileName = inputElement.value || '';
                                    });
    
                                    // 监听输入框的键盘事件
                                    inputElement.addEventListener('keyup', () => {
                                        fileName = inputElement.value || '';
                                    });
    
                                    // 监听选择框的变化
                                    selectElement.addEventListener('change', () => {
                                        fileExtension = selectElement.value;
                                    });
    
                                    confirmButton.addEventListener('click', async () => {
                                        fileName = inputElement.value || fileName;
                                        fileExtension = selectElement.value || fileExtension;
                                        const fullFileName = `${fileName}.${fileExtension}|${fileName}`;

                                        if (fileName != '') {
                                            this.insertCodeFileLink(fullFileName, "");
                                            setTimeout(() => {
                                                this.openCurrentContentInModal();
                                            }, 150);
                                        }

                                        obs.disconnect();
                                        resolve();
                                    });
                                }
                                return;
                            }
                        }
                    }
                }
            });
    
            observer.observe(document.body, { childList: true, subtree: true });
    
            // 设置监听器后执行命令
            setTimeout(() => {
                (this.app as any).commands.executeCommandById("vscode-editor:create");
                const codePlugin = this.getPlugin("code-files");
                if (codePlugin) {
                    (this.app as any).commands.executeCommandById("code-files:create");
                }
            }, 0);
    
            // 设置超时检查
            setTimeout(() => {
                observer.disconnect();
                resolve();
            }, 10000);
        });
    }
    
    private async getNewFileName(fileType: string): Promise<{ fileName: string, isEmbed: boolean } | null> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const selectedText = activeView?.editor?.getSelection() || '';
    
        return new Promise((resolve) => {
            const modal = new Modal(this.app);
            modal.titleEl.setText(t("Enter new file name"));
            
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
            select.createEl("option", { text: t("Wiki link"), value: "wikilink" });
            select.createEl("option", { text: t("Embed link"), value: "embed" });
    
            const buttonContainer = container.createDiv({ cls: 'new-file-button-container' });
    
            const confirmButton = buttonContainer.createEl("button", { 
                text: t("Confirm"), 
                cls: 'new-file-button confirm'
            });
            const cancelButton = buttonContainer.createEl("button", { 
                text: t("Cancel"), 
                cls: 'new-file-button'
            });
    
            const confirmAction = () => {
                const fileName = input.value.trim();
                if (fileName) {
                    resolve({
                        fileName: fileName,
                        isEmbed: select.value === "embed"
                    });
                    modal.close();
                }
            };
    
            confirmButton.onclick = confirmAction;

            input.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    confirmAction();
                }
            });

            cancelButton.onclick = () => {
                resolve(null);
                modal.close();
            };
            modal.open();
        });
    }
    
    private insertCodeFileLink(filePath: string, content: string) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            const editor = activeView.editor;
            const cursor = editor.getCursor();
            const linkText = `[[${filePath}]]`;
            editor.replaceRange(linkText, cursor);
        }
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
        const result = await this.getNewFileName(fileType);
        if (!result) return;
    
        const { fileName, isEmbed } = result;
        let newFilePath = '';
    
        if (fileName.includes('/') || parentPath === '/') {
            newFilePath = fileName;
        } else {
            newFilePath = `${parentPath}/${fileName}`;
        }

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
        this.addFloatMenuItem(menu, link || '', t("Open in modal window"), () => {
            if (link) {
                this.openInFloatPreview(this.currentAnchor || link);
            }
        });
    }
    
    private addFolderFloatMenuItem(menu: Menu, link?: string) {
        this.addFloatMenuItem(menu, link || '', t("Open in modal window"), () => {
            if (link) {
                this.folderNoteOpenInFloatPreview(link);
            }
        });
    }
    
    private addLinkFloatMenuItem(menu: Menu, link?: string) {
        this.addFloatMenuItem(menu, link || '', t("Open in modal window"), () => {
            if (link) {
                this.openInFloatPreview(link);
            }
        });
    }

    private async openInFloatPreview(link: string) {
        try {
            // console.log("OpenLink:", link);
            // 适配 auto content tco
            if (link?.startsWith('#')) {
                const currentFilePath = this.app.workspace.getActiveFile()?.path || '';
                link = currentFilePath + link;
            }

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

        private async onActiveLeafChange(activeLeaf: RealLifeWorkspaceLeaf): Promise<void> {
        if (!this.settings.preventsDuplicateTabs) {
            return; // 如果功能未启用，直接返回
        }
        if (activeLeaf.view.containerEl.closest('.modal-opener')) {
            return; // 如果是模态窗口，不处理
        }

        const { id } = activeLeaf;

        if (this.processors.has(id)) {
            // console.log(`已经在处理叶子 ${id}`);
            return;
        }

        const processor = this.processActiveLeaf(activeLeaf);
        this.processors.set(id, processor);

        try {
            await processor;
        } finally {
            this.processors.delete(id);
            // console.log(`完成处理叶子 ${id}`);
        }
    }

    private async processActiveLeaf(activeLeaf: RealLifeWorkspaceLeaf): Promise<void> {
        if (!this.settings.preventsDuplicateTabs) {
            return; // 如果功能未启用，直接返回
        }
        const filePath = activeLeaf.view.getState().file;
        if (!filePath) return;

        const viewType = activeLeaf.view.getViewType();
        const duplicateLeaves = this.app.workspace.getLeavesOfType(viewType)
            .filter(l => 
                l !== activeLeaf && 
                l.view.getState().file === filePath &&
                (l as RealLifeWorkspaceLeaf).parent.id === activeLeaf.parent.id
            )
            .sort((a, b) => (b as RealLifeWorkspaceLeaf).activeTime - (a as RealLifeWorkspaceLeaf).activeTime);

        if (duplicateLeaves.length === 0) return;

        const targetToFocus = duplicateLeaves.find(l => (l as RealLifeWorkspaceLeaf).pinned) || duplicateLeaves[0];

        return new Promise((resolve) => {
            setTimeout(() => {
                if (activeLeaf.view.containerEl.closest('.modal-opener')) {
                    resolve();
                    return;
                }

                const ephemeralState = activeLeaf.getEphemeralState();

                if (activeLeaf.view.navigation && activeLeaf.history.backHistory.length > 0) {
                    activeLeaf.history.back();
                } else if (!activeLeaf.pinned) {
                    activeLeaf.detach();
                }

                setTimeout(() => {
                    this.app.workspace.setActiveLeaf(targetToFocus, { focus: true });
                    if (Object.keys(ephemeralState).length > 0) {
                        targetToFocus.setEphemeralState(ephemeralState);
                    }
                    resolve();
                }, 100);
            }, 100);
        });
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

    private getPlugin(pluginId: string) {
        const app = this.app as any;
        return app.plugins.plugins[pluginId];
    }
}