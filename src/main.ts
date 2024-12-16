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
    // private middleClickHandler: ((evt: MouseEvent) => void) | undefined;
    private altClickHandler: ((evt: MouseEvent) => void) | undefined;

    static activeModalWindow: ModalWindow | null = null;
    private processors: Map<string, Promise<void>> = new Map();


    async onload() {
        await this.loadSettings();

        this.registerOpenHandler();
        this.registerContextMenuHandler();
        
        this.applyStyles();
        this.registerCustomCommands();
        this.addSettingTab(new ModalOpenerSettingTab(this.app, this));

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
            file instanceof TFile ? file : undefined,
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
        // if (this.middleClickHandler) {
        //     document.removeEventListener('mousedown', this.middleClickHandler, { capture: true });
        //     this.middleClickHandler = undefined;
        // }
        if (this.altClickHandler) {
            document.removeEventListener('click', this.altClickHandler, { capture: true });
            this.altClickHandler = undefined;
        }
    }

    private registerOpenHandler() {
        // Remove previous event listeners
        this.removeEventListeners();

        // Register new event handlers based on settings
        if (this.settings.openMethod === "drag" || this.settings.openMethod === "both") {
            this.registerDragHandler();
        }
        // if (this.settings.openMethod === "middle" || this.settings.openMethod === "both") {
        //     this.registerMouseMiddleClickHandler();
        // }
        if (this.settings.openMethod === "altclick" || this.settings.openMethod === "both") {
            this.registerAltClickHandler();
        }
    }

    private registerDragHandler() {
        this.dragHandler = () => {
            this.registerDomEvent(document, 'dragstart', (evt: DragEvent) => {
                const target = evt.target as HTMLElement;
                if (this.isPreviewModeLink(target)) {
                    // Check if the target has 'nav-folder-children' or 'nav-folder' class
                    if (!target.closest('.nav-folder-children') && !target.closest('.nav-folder')) {
                        this.draggedLink = this.getPreviewModeLinkText(target);
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

    private handlePreviewModeLink(evt: MouseEvent) {
        let target = evt.target as HTMLElement;
        // 向上查找包含 'internal-embed' 类的父元素
        if (target.classList.contains('canvas-minimap') 
            || target.classList.contains('file-embed-title') 
            || target.classList.contains('markdown-embed-link')
            || target.closest('svg') 
            || target.closest('.ptl-tldraw-image-container') 
            || target.closest('.dataloom-padding')
            || target.closest('.dataloom-bottom-bar')
            || target.closest('[data-viewport-type="element"]')
            || target.closest('.dataloom-bottom-bar')
        ) {
            target = target.closest('.internal-embed') as HTMLElement || target;
        }
    
        if (this.isPreviewModeLink(target)) {
            evt.preventDefault();
            evt.stopImmediatePropagation();
            const link = this.getPreviewModeLinkText(target);
            const isFolderLink = target.classList.contains('has-folder-note');
            const app = this.app as any;
            const folderPlugin = app.plugins.plugins["folder-notes"];
            // console.log(link);
            if (!folderPlugin || !isFolderLink) {
                this.openInFloatPreview(link);
            } else {
                this.folderNoteOpenInFloatPreview(link);
            }
        }
    }

    private handleEditModeLink(editor: Editor) {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const linkMatch = this.findLinkAtPosition(line, cursor.ch);

        if (linkMatch) {
            this.openInFloatPreview(linkMatch);
        } else {
            new Notice(t("No link found at cursor position"));
        }
    }
    
    // private registerMouseMiddleClickHandler() {
    //     this.middleClickHandler = (evt: MouseEvent) => {
    //         if (evt.button === 1) {
    //             const target = evt.target as HTMLElement;
    //             // if (this.isPreviewModeLink(target) || this.isEditModeLink(target)) {
    //             if (this.isPreviewModeLink(target)) {
    //                 evt.preventDefault();
    //                 evt.stopPropagation();
    //                 this.handlePreviewModeLink(evt);
    //             }
    //         }
    //     };
    //     document.addEventListener('mousedown', this.middleClickHandler, { capture: true });
    // }

    // 等canvas alt+click和其他类型一样表现为选取链接 可以改用此方法
    // private registerAltClickHandler() {
    //     this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
    //         if (evt.altKey && evt.button === 0) {
    //             // 使用 setTimeout 来确保我们的处理在默认操作之后执行
    //             setTimeout(() => {
    //                 const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    //                 if (activeView) {
    //                     let targetElement = evt.target as HTMLElement;
    //                     let altText = targetElement.getAttribute("alt");
    
    //                     if (this.isPreviewModeLink(targetElement)) {
    //                         this.handlePreviewModeLink(evt);
    //                     } else {
    //                         if (activeView.getMode() === 'source') {
    //                             // 适配 markmind 在编辑模式下嵌入视图的 alt 点击
    //                             if (targetElement.closest('svg')) {
    //                                 this.handlePreviewModeLink(evt);
    //                                 return;
    //                             }
    //                             // 适配diagram.net svg 类型的文件 alt+点击  不做处理
    //                             if (altText && altText.endsWith(".svg")) {
    //                                 return;
    //                             }
    //                             this.handleEditModeLink(activeView.editor);
    //                         } else {
    //                             this.handlePreviewModeLink(evt);
    //                         }
    //                     }
    //                 }
    //             }, 10);
    //         }
    //     });
    // }
    
    private isInFencedCodeBlock(editor: Editor, pos: EditorPosition): boolean {
        const currentLine = pos.line;
        let fenceCount = 0;
    
        // 检查围栏标记
        for (let i = 0; i <= currentLine; i++) {
            const line = editor.getLine(i).trim();
            if (line.startsWith("```")) {
                fenceCount++;
            }
        }
    
        return fenceCount % 2 === 1;
    }

    private registerAltClickHandler() {
        this.altClickHandler = (evt: MouseEvent) => {
            // 如果按下了 ctrl + alt + click，则保持默认行为
            if (evt.altKey && evt.ctrlKey && evt.button === 0) {
                return;
            }
            if (evt.altKey && evt.button === 0) {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                // 从点击的��素开始，向上查找 .view-content 类
                let targetElement = evt.target as HTMLElement;
                let altText = targetElement.getAttribute("alt");
                // 调试信息：打印点击的元素和其类名
                // console.log("Clicked element:", targetElement);
                // console.log("Classes:", targetElement.classList);
                if (activeView) {
                    // 如果在 Code Block中
                    if (activeView.getMode() === 'source') {
                        const editor = activeView.editor;
                        const cursor = editor.getCursor();
                        if (this.isInFencedCodeBlock(editor, cursor)) {
                            (this.app as any).commands.executeCommandById("vscode-editor:edit-fence");
                            return;
                        }
                    }

                    if (this.isPreviewModeLink(targetElement)) {
                        this.handlePreviewModeLink(evt);
                    } else {
                        if (activeView.getMode() === 'source') {
                            // 适配 markmind 在编辑模式下嵌入视图的 alt 点击
                            if (targetElement.closest('svg')) {
                                this.handlePreviewModeLink(evt);
                                return;
                            }
                            // 适配在编辑模式下 richfoot 的 alt 点击
                            if (targetElement.closest('.rich-foot')) {
                                this.handlePreviewModeLink(evt);
                                return;
                            }
                            // 适配diagram.net svg 类型的文件 alt+点击  不做处理
                            if (altText && altText.endsWith(".svg")) {
                                // console.log("altText", altText);
                                return;
                            }
                            this.handleEditModeLink(activeView.editor);
                            // 阻止surfing弹出下载框
                            evt.preventDefault();
                            evt.stopImmediatePropagation();
                        } else {
                            this.handlePreviewModeLink(evt);
                        }
                    }
                } else {
                    const canvasView = this.app.workspace.getLeavesOfType("canvas").first()?.view;
                    const excalidrawView = this.app.workspace.getLeavesOfType("excalidraw").first()?.view;
                    // 适配canvas视图
                    if (canvasView && this.isPreviewModeLink(targetElement)) {
                        this.handlePreviewModeLink(evt);
                    }
                    // 适配 Excalidraw embedded file 目前无法处理嵌入文档的内部链接
                    const link = targetElement.textContent?.trim().replace(/\[\[(.*?)\]\]/, '$1');
                    if(excalidrawView && link) {
                        this.openInFloatPreview(link);
                    }
                }
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
                this.addDeleteAttachmentMenuItem(menu, editor);
            })
        );
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
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && activeView.getMode() === 'source') {
                    const editor = activeView.editor;
                    const cursor = editor.getCursor();
                    const line = editor.getLine(cursor.line);
                    const foundLink = this.findLinkAtPosition(line, cursor.ch);
                    // console.log("foundLink", foundLink);
                    if (foundLink) {
                        this.openInFloatPreview(foundLink);
                    } else {
                        this.openInFloatPreview(link);
                    }
                } else if (activeView && activeView.getMode() === 'preview') {
                    // 不直接采用openInFloatPreview的原因 是适配带锚点的链接
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const linkElement = range.startContainer.parentElement?.closest('a') as HTMLAnchorElement;
                        if (linkElement) {
                            link = linkElement.getAttribute('data-href') || linkElement.getAttribute('href') || link;
                            this.openInFloatPreview(link);
                        }
                    } else {
                        // 修复 Components 数据视图右键选项
                        this.openInFloatPreview(link);
                    }
                } else {
                    this.openInFloatPreview(link);
                }
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
            const [linkWithoutAlias] = link.split('|');

            // 然后分割文件路径和片段
            const [filePath, fragment] = linkWithoutAlias.split('#');
            const abstractFile = this.app.metadataCache.getFirstLinkpathDest(filePath, "");
            let file: TFile | undefined;

            if (abstractFile instanceof TFile) {
                file = abstractFile;
            } else {
                file = undefined;
            }
            
            // 检测文件是否存在
            if (!file && !this.isValidURL(link)) {
                new Notice(t("The file or link does not exist: ") + filePath);
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

    // create File And Open In Modal
    private addCreateFileMenuItem(menu: Menu, parentPath: string) {
        menu.addItem((item) => {
            item
                .setTitle(t('Create and edit in modal'))
                .setIcon('file-plus')
    
            const subMenu = (item as any).setSubmenu();
    
            // 初始化计数器
            let group1Count = 0;
            let group2Count = 0;
    
            // 第一组：Markdown 和 Canvas
            if (this.settings.enabledCommands.markdown) {
                group1Count++;
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Markdown")
                        .setIcon("file")
                        .onClick(() => {
                            this.createFileAndEditInModal(parentPath, "md");
                        })
                );
            }
    
            const canvasPlugin = (this.app as any).internalPlugins.getEnabledPluginById("canvas");
            if (canvasPlugin && this.settings.enabledCommands.canvas) {
                group1Count++;
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Canvas")
                        .setIcon("layout-dashboard")
                        .onClick(() => {
                            this.createFileAndEditInModal(parentPath, "canvas");
                        })
                );
            }
    
            // 如果第一组有项目，添加分隔线
            if (group1Count >= 1) {
                subMenu.addSeparator();
            }
    
            // 第二组：Excalidraw、Diagrams 和 Tldraw
            const excalidrawPlugin = this.getPlugin("obsidian-excalidraw-plugin");
            const excalidrawymjrPlugin = this.getPlugin("obsidian-excalidraw-plugin-ymjr");
            if ((excalidrawPlugin || excalidrawymjrPlugin) && this.settings.enabledCommands.excalidraw) {
                group2Count++;
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Excalidraw")
                        .setIcon("swords")
                        .onClick(async () => {
                            const initialLeafCount = this.app.workspace.getLeavesOfType('excalidraw').length;
                            let commandId;
                            if (excalidrawPlugin) {
                                commandId = "obsidian-excalidraw-plugin:excalidraw-autocreate-and-embed-new-tab";
                            } else if (excalidrawymjrPlugin) {
                                commandId = "obsidian-excalidraw-plugin-ymjr:excalidraw-autocreate-and-embed-new-tab";
                            }
                            (this.app as any).commands.executeCommandById(commandId);
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
            if (diagramsPlugin && this.settings.enabledCommands.diagrams) {
                group2Count++;
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Diagrams")
                        .setIcon("pencil-ruler")
                        .onClick(() => {
                            (this.app as any).commands.executeCommandById("obsidian-diagrams-net:app:diagrams-net-new-diagram");
                        })
                );
            }
    
            const tldrawPlugin = this.getPlugin("tldraw");
            if (tldrawPlugin && this.settings.enabledCommands.tldraw) {
                group2Count++;
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Tldraw")
                        .setIcon("shapes")
                        .onClick(async () => {
                            await (this.app as any).commands.executeCommandById("tldraw:embed-new-tldraw-file-.md-new-tab");
                            setTimeout(() => {
                                this.openCurrentContentInModal();
                            }, 500);
                            
                            // await this.createFileAndInsertLink("tldraw:new-tldraw-file-.md-new-tab", true);
                        })
                );
            }
    
            // 如果第二组有项目，添加分隔线
            if (group2Count >= 1) {
                subMenu.addSeparator();
            }
    
            // 第三组：其余插件
            const excelPlugin = this.getPlugin("excel");
            if (excelPlugin && this.settings.enabledCommands.excel) {
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Excel")
                        .setIcon("table")
                        .onClick(async () => {
                            await this.createFileAndInsertLink("excel:excel-autocreate", true);
                        })
                );
            }
    
            const SheetPlugin = this.getPlugin("sheet-plus");
            if (SheetPlugin && this.settings.enabledCommands.sheetPlus) {
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Sheet Plus")
                        .setIcon("grid")
                        .onClick(async () => {
                            await this.createFileAndInsertLink("sheet-plus:spreadsheet-autocreation", true);
                        })
                );
            }
            
            const vscodePlugin = this.getPlugin("vscode-editor");
            if (vscodePlugin && this.settings.enabledCommands.vscode) {
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
            if (markmindPlugin && this.settings.enabledCommands.markmind) {
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("MarkMind")
                        .setIcon("brain-circuit")
                        .onClick(async () => {
                            await this.createFileAndInsertLink("obsidian-markmind:Create New MindMap", true);
                        })
                );
            }
    
            const dataloomPlugin = this.getPlugin("notion-like-tables");
            if (dataloomPlugin && this.settings.enabledCommands.dataloom) {
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Dataloom")
                        .setIcon("container")
                        .onClick(async () => {
                            // await (this.app as any).commands.executeCommandById("notion-like-tables:create-and-embed");
                            await this.createFileAndInsertLink("notion-like-tables:create", true);
                        })
                );
            }
        });
    }

    private addDeleteAttachmentMenuItem(menu: Menu, editor: Editor) {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const linkMatch = this.findLinkAtPosition(line, cursor.ch);
        
        if (linkMatch) {
            // 处理可能包含别名和锚点的链接文本
            const [filePath] = linkMatch.split('|');  // 先处理别名
            const [filePathWithoutAnchor] = filePath.split('#');  // 再处理锚点
            const file = this.app.metadataCache.getFirstLinkpathDest(filePathWithoutAnchor, "");
            
            if (file && file instanceof TFile) {
                menu.addItem((item) => {
                    item
                        .setTitle(t("Delete linked attachment"))
                        .setIcon("trash")
                        .onClick(() => {
                            const modal = new Modal(this.app);
                            modal.titleEl.setText(t("Confirm deletion?"));
                            
                            const content = modal.contentEl.createDiv();
                            content.setText(file.path);
                            
                            const buttonContainer = content.createDiv({ cls: 'modal-button-container' });
                            
                            buttonContainer.createEl('button', { text: t("Cancel") })
                                .onclick = () => modal.close();
                            
                            buttonContainer.createEl('button', 
                                { text: t("Delete"), cls: 'mod-warning' })
                                .onclick = async () => {
                                    try {
                                        await this.app.fileManager.trashFile(file);
                                        // 检查是否包含感叹号
                                        const startIndex = line.indexOf("![[");
                                        const isEmbed = startIndex !== -1;
                                        
                                        const from = { 
                                            line: cursor.line, 
                                            ch: isEmbed ? startIndex : line.indexOf("[[") 
                                        };
                                        const to = { 
                                            line: cursor.line, 
                                            ch: line.indexOf("]]") + 2 
                                        };
                                        editor.replaceRange("", from, to);
                                        new Notice(t("File moved to trash"));
                                        modal.close();
                                    } catch (error) {
                                        new Notice(t("Failed to delete file"));
                                    }
                                };
                            
                            modal.open();
                        });
                });
            }
        }
    }

    private async createFileAndInsertLink(commandId: string, isEmbed: boolean) {
        // 保存当前活动编辑器的信息
        const previousView = this.app.workspace.getActiveViewOfType(MarkdownView);
    
        let previousEditor: Editor | null = null;
        let previousCursor: EditorPosition | null = null;
    
        if (previousView) {
            previousEditor = previousView.editor;
            previousCursor = previousEditor.getCursor();
        }
        (this.app as any).commands.executeCommandById(commandId);

        const newLeaf = this.app.workspace.getLeaf(true);
        this.app.workspace.setActiveLeaf(newLeaf, { focus: true });
    
        const activeFile = await this.waitForActiveFile();
    
        if (activeFile && previousEditor && previousCursor) {
            const fileName = activeFile.name;
            const filePath = activeFile.path;
            const linkText = isEmbed ? `![[${filePath}|${fileName}]]` : `[[${filePath}|${fileName}]]`;
            
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
            if (fileType == "canvas") {
                select.createEl("option", { text: t("Embed link"), value: "embed" });
                select.createEl("option", { text: t("Wiki link"), value: "wikilink" });
            } else {
                select.createEl("option", { text: t("Wiki link"), value: "wikilink" });
                select.createEl("option", { text: t("Embed link"), value: "embed" });
            }
    
            const buttonContainer = container.createDiv({ cls: 'new-file-button-container' });
    
            const confirmButton = buttonContainer.createEl("button", { 
                text: t("Confirm"), 
                cls: 'new-file-button confirm'
            });
            const cancelButton = buttonContainer.createEl("button", { 
                text: t("Cancel"), 
                cls: 'new-file-button cancel'
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
            const linkText = `![[${filePath}]]`;
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
            new Notice(t("Failed to create file: ") + error.message);
        }
    }

    // no dupe leaf
    private async onActiveLeafChange(activeLeaf: RealLifeWorkspaceLeaf): Promise<void> {
        if (!this.settings.preventsDuplicateTabs || activeLeaf.view.containerEl.closest('.modal-opener')) {
            return;
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
    
        // 延迟处理，给予新页面加载的时间
        await new Promise(resolve => setTimeout(resolve, this.settings.delayInMs));
    
        const filePath = activeLeaf.view.getState().file;
        if (!filePath) return;
    
        const viewType = activeLeaf.view.getViewType();
        const duplicateLeaves = this.app.workspace.getLeavesOfType(viewType)
            .filter(l => 
                l !== activeLeaf && 
                l.view.getState().file === filePath &&
                (l as RealLifeWorkspaceLeaf).parent.id === activeLeaf.parent.id
            );
    
        if (duplicateLeaves.length === 0) return;
    
        // 根据活跃时间排序，最近活跃的在前
        const sortedLeaves = [activeLeaf, ...duplicateLeaves].sort((a, b) => 
            (b as any).activeTime - (a as any).activeTime
        );
    
        const mostRecentLeaf = sortedLeaves[0];
        const oldestLeaf = sortedLeaves[sortedLeaves.length - 1];
    
        // 如果当前叶子不是最近活跃的，我们需要进一步处理
        if (activeLeaf !== mostRecentLeaf) {
            // 如果当前叶子是最老的，我们应该保留它并关闭其他的
            if (activeLeaf === oldestLeaf) {
                for (const leaf of duplicateLeaves) {
                    if (!(leaf as any).pinned) {
                        leaf.detach();
                    }
                }
                this.app.workspace.setActiveLeaf(activeLeaf, { focus: true });
            } else {
                // 否则，我们应该关闭当前叶子
                if (activeLeaf.view.navigation && activeLeaf.history.backHistory.length > 0) {
                    activeLeaf.history.back();
                } else if (!(activeLeaf as any).pinned) {
                    activeLeaf.detach();
                }
                this.app.workspace.setActiveLeaf(mostRecentLeaf, { focus: true });
            }
        } else {
            // 当前叶子是最近活跃的，我们应该保留它并关闭其他的
            for (const leaf of duplicateLeaves) {
                if (!(leaf as any).pinned) {
                    leaf.detach();
                }
            }
        }
    }

    private isPreviewModeLink(target: HTMLElement): boolean {
        return target.tagName === 'A' && (target.classList.contains('external-link') || target.classList.contains('internal-link'))
            || target.classList.contains('auto-card-link-card') || target.classList.contains('recent-files-title-content') || target.classList.contains('metadata-link-inner')
            || target.classList.contains('has-folder-note') || target.classList.contains("homepage-button") || target.classList.contains('view-header-breadcrumb')
            || target.classList.contains('cm-hmd-internal-link')
            || target.classList.contains('internal-embed')
            || target.classList.contains('file-embed-title')
            || target.classList.contains('embed-title')
            || target.classList.contains('markdown-embed-link')
            || target.classList.contains('markdown-embed-content')
            || target.classList.contains('canvas-minimap')
            || Array.from(target.classList).some(cls => cls.startsWith('excalidraw-svg'))
            || target.classList.contains('svg')
    }
    
    private getPreviewModeLinkText(target: HTMLElement): string {
        return target.getAttribute('data-href') || target.getAttribute('href') || target.getAttribute('data-path') 
        || target.getAttribute('filesource') || target.getAttribute('src') || target.textContent?.trim() || '';
    }

    private findLinkAtPosition(line: string, position: number): string | null {
        // 匹配![[]]和[[]]格式的内部链接、Markdown链接和URL
        const linkRegex = /!?\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s]+)/g;
        let match;
        
        while ((match = linkRegex.exec(line)) !== null) {
            if (match.index <= position && position <= match.index + match[0].length) {
                // 返回内部链接、Markdown链接的URL，或直接的URL
                return match[1] || match[3] || match[4] || null;
            }
        }
        
        return null;
    }

    private isValidURL = (url: string) => 
        ['http://', 'https://', 'www.', '192.', '127.'].some(prefix => url.startsWith(prefix));

    public getPlugin(pluginId: string) {
        const app = this.app as any;
        return app.plugins.plugins[pluginId];
    }
}