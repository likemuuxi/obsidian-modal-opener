import { Plugin, Menu, getLanguage, TAbstractFile, Notice, TFile, TFolder, MenuItem, Editor, MarkdownView, normalizePath, Modal, EditorPosition, WorkspaceLeaf, Platform } from "obsidian";
import { t } from "./lang/helpers"
import { ModalWindow } from "./modal";
import ModalOpenerSettingTab from "./settings";
import { DEFAULT_SETTINGS, ModalOpenerPluginSettings, } from "./settings";


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
    private altClickHandler: ((evt: MouseEvent) => void) | undefined;
    private documentClickHandler: ((evt: MouseEvent) => void) | undefined;
    private settingClickHandler: ((evt: MouseEvent) => void) | undefined;
    static activeModalWindow: ModalWindow | null = null;
    private processors: Map<string, Promise<void>> = new Map();
    private activeLeafChangeTimeout: NodeJS.Timeout | null = null;
    private isProcessing: boolean = false;
    private webviewPlugin: boolean = (this.app as any).internalPlugins.getEnabledPluginById("webviewer");

    private excludeElements: string[] = [];
    private excludeContainers: string[] = [];
    private excludeFiles: string[] = [];

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new ModalOpenerSettingTab(this.app, this));

        this.applyStyles();
        this.updateExcludeData();
        this.registerOpenHandler();
        this.registerContextMenuHandler();
        this.registerCustomCommands();
        this.registerEvent(this.app.workspace.on("active-leaf-change", this.onActiveLeafChange.bind(this)));

        let openExternal: boolean | undefined;
        const webviewPlugin = (this.app as any).internalPlugins.getEnabledPluginById("webviewer");
        if (webviewPlugin) {
            openExternal = webviewPlugin.options.openExternalURLs;
            // new Notice(openExternal ? "将使用外部浏览器打开链接" : "将使用内部浏览器打开链接");
        }

        this.documentClickHandler = (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const { altKey, ctrlKey } = evt;
            const singleClick = !Platform.isMobile ? this.settings.clickWithoutAlt : this.settings.clickWithoutAltOnMobile;
            const singleClickType = !Platform.isMobile ? this.settings.typeOfClickTrigger : this.settings.typeOfClickTriggerOnMobile;

            // 编辑模式外部链接
            if (evt.ctrlKey && !evt.altKey) {
                if(target.classList.contains("cm-underline") || target.classList.contains("cm-url") || target.classList.contains("cm-link")) {
                    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (activeView && activeView.editor) {
                        const editor = activeView.editor;
                        const cursor = editor.getCursor();
                        const line = editor.getLine(cursor.line);
                        const linkMatch = this.findLinkAtPosition(line, cursor.ch);
                        if (linkMatch && this.isValidURL(linkMatch)) {
                            evt.preventDefault();
                            evt.stopImmediatePropagation();
                            if(openExternal) {
                                (window as any).require("electron").shell.openExternal(linkMatch);
                            } else {
                                const leaf = this.app.workspace.getLeaf(true);
                                this.loadSiteByWebViewer(linkMatch, leaf);
                            }
                        }
                    }
                    return;
                }

                if (target instanceof HTMLAnchorElement && target.href && this.isValidURL(target.href)) {
                    // alt + click / 单击
                    // if ((altKey && !ctrlKey) ||
                    //     (singleClick && !altKey && !ctrlKey && singleClickType !== 'internal')) {
                    //     // console.log("Opening link in external browser:", target.href);
                    //     evt.preventDefault();
                    //     evt.stopImmediatePropagation();
                    //     this.openInModalWindow(target.href);
                    // }
                    // ctrl + click
                    if (this.webviewPlugin) {
                        // console.log("Opening link in external browser:", target.href);
                        evt.preventDefault();
                        evt.stopImmediatePropagation();
                        if(openExternal === true) {
                            (window as any).require("electron").shell.openExternal(target.href);
                        } else {
                            const leaf = this.app.workspace.getLeaf(true);
                            this.loadSiteByWebViewer(target.href, leaf);
                        }
                    }
                }
            }
        };

        this.settingClickHandler = (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            if (evt.ctrlKey && !evt.altKey) {
                if (target instanceof HTMLAnchorElement && target.href && this.isValidURL(target.href)) {
                    evt.preventDefault();
                    evt.stopImmediatePropagation();
                    (window as any).require("electron").shell.openExternal(target.href);
                }
                return;
            }
        };
        
        document.addEventListener("click", this.documentClickHandler, true);

        // 添加对设置页容器的点击监听
        const settingsContainer = document.querySelector('.modal.mod-settings');
        if (settingsContainer) {
            settingsContainer.addEventListener('click', this.settingClickHandler, true);
        }

        this.addCommand({
            id: 'toggle-background-blur',
            name: 'Toggle background blur',
            callback: () => this.toggleBackgroundBlur()
        });
        this.addCommand({
            id: 'open-in-modal-window',
            name: 'Open current tab content in modal',
            callback: () => this.openContentInModal()
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
        document.body.classList.toggle('modal-blur-enabled', this.settings.enableBlur);
        document.body.classList.toggle('modal-rounding-enabled', this.settings.enableRounding);
        document.body.classList.toggle('show-file-view-header', this.settings.showFileViewHeader);
        document.body.classList.toggle('show-link-view-header', this.settings.showLinkViewHeader);
        document.body.classList.toggle('show-metadata', this.settings.showMetadata);
        document.body.classList.toggle('hider-scroll', !this.settings.hideScroll);
    }

    onunload() {
        this.app.workspace.off("active-leaf-change", this.onActiveLeafChange.bind(this));

        // 移除设置页容器的点击监听
        const settingsContainer = document.querySelector('.modal-content.vertical-tabs-container');
        if (settingsContainer && this.settingClickHandler) {
            settingsContainer.removeEventListener('click', this.settingClickHandler, true);
        }
        if (this.documentClickHandler) {
            document.removeEventListener("click", this.documentClickHandler, true);
            this.documentClickHandler = undefined;
        }   
        if (this.dragHandler) {
            document.removeEventListener('dragstart', this.dragHandler);
            document.removeEventListener('dragend', this.dragHandler);
            this.dragHandler = undefined; // Clear reference
        }
        if (this.altClickHandler) {
            document.removeEventListener('click', this.altClickHandler, { capture: true });
            this.altClickHandler = undefined;
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.updateExcludeData();
        this.registerOpenHandler();
        this.registerCustomCommands();
    }

    private updateExcludeData() {
        this.excludeFiles = this.settings.customExcludeFiles
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

        this.excludeElements = this.settings.customExcludeElements
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        this.excludeElements.push('.folder-overview-list-item');

        this.excludeContainers = this.settings.customExcludeContainers
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        this.excludeContainers.push('.block-language-table-of-contents');
    }

    private loadSiteByWebViewer(link: string, leaf: WorkspaceLeaf) {
        leaf.setViewState({
            type: "webviewer",
            active: true,
            state: {
                url: link,
                navigate: true,
                target: "_self",
            }
        });

        const webviewEl = document.querySelector("webview");
        if (webviewEl) {
            webviewEl.addEventListener("dom-ready", async (event: any) => {
                const { remote } = (window as any).require('electron');
                // @ts-ignore
                const webContents = remote.webContents.fromId(
                    (webviewEl as any).getWebContentsId()
                );

                // Open new browser tab if the web view requests it.
                webContents.setWindowOpenHandler((event: any) => {
                    this.app.workspace.getLeaf(true).setViewState({
                        type: "webviewer",
                        active: true,
                        state: {
                            url: event.url,
                            navigate: true,
                            target: "_self",
                        }
                    });
                    return {
                        action: "allow",
                    };
                });

                await this.registerWebAutoDarkMode(webContents);
                // if (this.settings.enableWebAutoDarkMode) {
                //     await this.registerWebAutoDarkMode(webContents);
                // }
                // if (this.settings.enableImmersiveTranslation) {
                //     await this.registerImmersiveTranslation(webContents);
                // }
            });
        }
    }

    private openContentInModal() {
        const currentFilePath = this.app.workspace.getActiveFile()?.path || '';
        const file = this.app.vault.getAbstractFileByPath(currentFilePath);
        const activeLeaf = this.app.workspace.getLeaf(false);

        if (!activeLeaf) {
            return;
        }

        const frameSelector = this.webviewPlugin ? 'webview' : 'iframe';
        const frameElement = activeLeaf.view.containerEl.querySelector(frameSelector) as HTMLIFrameElement;
        const linkValue = frameElement?.src || "";

        new ModalWindow(
            this,
            linkValue,
            file instanceof TFile ? file : undefined,
            ""
        ).open();
        this.isProcessing = true;
    }

    private toggleBackgroundBlur() {
        this.settings.enableBlur = !this.settings.enableBlur;
        document.body.classList.toggle('modal-blur-enabled', this.settings.enableBlur);
        this.saveSettings();
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
            this.openInModalWindow(command);
        } else {
            const abstractFile = this.app.vault.getAbstractFileByPath(command);
            if (abstractFile instanceof TFile) {
                this.openInModalWindow(command);
            } else {
                const file = this.app.metadataCache.getFirstLinkpathDest(command, "");
                if (file instanceof TFile) {
                    this.openInModalWindow(command);
                } else {
                    new Notice(t("File not found: ") + command);
                }
            }
        }
    }

    private registerContextMenuHandler() {
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
                const folderTarget = document.querySelector(`.nav-folder-title[data-path="${file.path}"]`);
                const app = this.app as any;
                const folderPlugin = app.plugins.plugins["folder-notes"];
                if (folderPlugin) {
                    if (folderTarget && folderTarget.classList.contains("has-folder-note")) {
                        this.addFolderFloatMenuItem(menu, file.path);
                    } else if (!folderTarget) {
                        this.addFileFloatMenuItem(menu, file.path);
                    }
                } else {
                    if (!folderTarget) {
                        this.addFileFloatMenuItem(menu, file.path);
                    }
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on("url-menu", (menu: Menu, link: string) => {
                this.addLinkFloatMenuItem(menu, link);
            })
        );

        this.registerEvent(
            this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, view: MarkdownView) => {
                if (this.settings.showDeleteCommands) {
                    this.addDeleteAttachmentMenuItem(menu, editor);
                }

                if (this.settings.showCommandsContainer) {
                    this.addCreateFileMenuItem(menu);
                }
            })
        );
    }

    private registerOpenHandler() {
        if (this.dragHandler) {
            document.removeEventListener('dragstart', this.dragHandler);
            document.removeEventListener('dragend', this.dragHandler);
            this.dragHandler = undefined;
        }
        if (this.altClickHandler) {
            document.removeEventListener('click', this.altClickHandler, { capture: true });
            this.altClickHandler = undefined;
        }
        if (this.settings.openMethod === "drag" || this.settings.openMethod === "both") {
            this.registerDragHandler();
        }
        if (this.settings.openMethod === "altclick" || this.settings.openMethod === "both") {
            this.registerAltClickHandler();
            if (Platform.isMobile) this.registerTouchClickHandler();
        }
    }

    private registerDragHandler() {
        this.dragHandler = () => {
            this.registerDomEvent(document, 'dragstart', (evt: DragEvent) => {
                const target = evt.target as HTMLElement;
                if (this.isPreviewModeLink(target)) {
                    if (!target.closest('.nav-folder-children') && !target.closest('.nav-folder')) {
                        this.draggedLink = this.getPreviewModeLinkText(target);
                        this.dragStartTime = Date.now();
                    }
                }
            });

            this.registerDomEvent(document, 'dragend', (_evt: DragEvent) => {
                if (this.draggedLink) {
                    if (this.settings.dragThreshold === 0) {
                        this.openInModalWindow(this.draggedLink);
                    } else if (this.dragStartTime) {
                        const dragDuration = Date.now() - this.dragStartTime;
                        if (dragDuration >= this.settings.dragThreshold) {
                            this.openInModalWindow(this.draggedLink);
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

    private registerTouchClickHandler() {
        document.addEventListener('touchstart', (touchEvt: TouchEvent) => {
            const target = touchEvt.target as HTMLElement;
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

            if (
                this.settings.clickWithoutAltOnMobile &&
                activeView?.getMode() === 'source' &&
                target.classList.contains('cm-underline')
            ) {
                touchEvt.preventDefault();
                touchEvt.stopImmediatePropagation();
                // new Notice("isMobile Touch");
                // this.handleSourceModeLink(activeView.editor, touchEvt);
            }
        }, { capture: true });
    }

    /*
    // 等canvas alt+click和其他类型一样表现为选取链接 可以改用此方法
    private registerAltClickHandler() {
        this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
            if (evt.altKey && evt.button === 0) {
                // 使用 setTimeout 来确保我们的处理在默认操作之后执行
                setTimeout(() => {
                    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (activeView) {
                        let targetElement = evt.target as HTMLElement;
                        let altText = targetElement.getAttribute("alt");

                        if (this.isPreviewModeLink(targetElement)) {
                            this.handlePreviewModeLink(evt);
                        } else {
                            if (activeView.getMode() === 'source') {
                                // 适配 markmind 在编辑模式下嵌入视图的 alt 点击
                                if (targetElement.closest('svg')) {
                                    this.handlePreviewModeLink(evt);
                                    return;
                                }
                                // 适配diagram.net svg 类型的文件 alt+点击  不做处理
                                if (altText && altText.endsWith(".svg")) {
                                    return;
                                }
                                this.handleSourceModeLink(activeView.editor);
                            } else {
                                this.handlePreviewModeLink(evt);
                            }
                        }
                    }
                }, 10);
            }
        });
    } */

    private registerAltClickHandler() {
        this.altClickHandler = (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const activeView = this.app.workspace.getMostRecentLeaf()?.view;
            const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;

            const isAltClick = evt.altKey && evt.button === 0;
            const isSingleClick = !Platform.isMobile ? this.settings.clickWithoutAlt : this.settings.clickWithoutAltOnMobile;
            const singleClickType = !Platform.isMobile ? this.settings.typeOfClickTrigger : this.settings.typeOfClickTriggerOnMobile;

            if (evt.button !== 0) return; // 忽略非左键点击
            if (evt.ctrlKey || evt.shiftKey) return; // 忽略 Ctrl/Shift键

            if (!isAltClick && !isSingleClick) return;
            
            if (editor && editor.somethingSelected()) return; // 忽略选择文字的情况
            if (target.getAttribute("alt")?.endsWith(".svg")) return; // 检查特殊元素 diagram.svg

            // 如果是单击模式但不允许 external 类型触发，则排除在外
            if (!isAltClick && isSingleClick && singleClickType !== 'external' && target.closest('.workspace-leaf-content[data-type="markdown"]')) {
                const currentFilePath = this.app.workspace.getActiveFile()?.path;
                if (currentFilePath && this.excludeFiles.length > 0) {
                    const isExcluded = this.excludeFiles.includes(currentFilePath);
                    if (isExcluded) return;
                }
            }

            // 添加 frontmatter 处理逻辑
            if (target.matches('.multi-select-pill-content > span')) {
                const spanValue = target.textContent?.trim();
                const activeFile = this.app.workspace.getActiveFile();

                if (!spanValue || !activeFile) {
                    return;
                }

                const fileCache = this.app.metadataCache.getFileCache(activeFile);
                const frontmatterLinks = fileCache?.frontmatterLinks;

                if (!frontmatterLinks || frontmatterLinks.length === 0) {
                    return;
                }

                // 3. 在解析好的链接中查找匹配项
                const matchedLink = frontmatterLinks.find(link => {
                    // link.link 是链接路径 (例如 "My Note#heading")
                    // link.displayText 是链接别名 (例如 "My Alias")
                    // console.log("Link:", link);
                    const linkBasename = link.link.split('#')[0]; // 获取不带标题/块引用的基本名称
                    return link.displayText === spanValue || linkBasename === spanValue;
                });

                if (matchedLink) {
                    evt.preventDefault();
                    evt.stopImmediatePropagation();
                    this.openInModalWindow(matchedLink.link);
                }
            }
            
            // 处理预览模式下的链接点击
            if (this.isPreviewModeLink(target)) {
                this.handlePreviewModeLink(evt, isAltClick);
                return;
            }

            // 编辑模式下的点击处理
            if (activeView instanceof MarkdownView && activeView.getMode() === 'source') {
                if (target.closest('.markdown-source-view')) {
                    const cursor = activeView.editor.getCursor();
                    if (this.isInFencedCodeBlock(activeView.editor, cursor)) {
                        if (!isSingleClick || (isSingleClick && isAltClick)) {
                            (this.app as any).commands.executeCommandById("vscode-editor:edit-fence");
                            return;
                        }
                    }

                    if (
                        target.classList.contains("cm-underline") ||
                        target.classList.contains("cm-hmd-internal-link") ||
                        target.classList.contains("cm-link") ||
                        target.classList.contains("cm-url")
                    ) {
                        this.handleSourceModeLink(activeView.editor, evt, isAltClick);
                    }
                }
            }
        };
        document.addEventListener('click', this.altClickHandler, { capture: true });
    }

    private isPreviewModeLink(target: HTMLElement): boolean {
        const element = target;

        if (!element) return false;
        
        // 支持设置面板
        if (element.tagName === 'A' && element.closest('.vertical-tab-content')) {
            return true;
        }

        // 支持社区面板
        if (element.tagName === 'A' && element.closest('.community-modal-details')) {
            return true;
        }

        if (element.tagName === 'A' && (element.classList.contains('external-link') || element.classList.contains('internal-link'))) {
            return true;
        }

        // 支持出链链接
        if (element.closest('.search-result-file-title .tree-item-inner')) {
            return true;
        }

        // 支持Base
        if (element.closest('.bases-cards-item')) {
            return true;
        }

        // 支持反向链接的更多内容
        if (element.tagName === 'SPAN' && element.closest('.search-result-file-match')) {
            return true;
        }

        // 支持NoteToolbar的更多内容
        if (element.tagName === 'SPAN' && element.closest('.callout-content')) {
            return true;
        }

        // 支持Simple Mind Map
        if (element.textContent && element.textContent.includes("该文件中没有可预览图片")) {
            return true;
        }
        if (element.tagName === 'IMG' && element.hasAttribute("data-smm-file")) {
            return true;
        }

        const closestList = ['.annotated-link', '.ge-grid-item', '.outgoing-link-item']; // 适配 Nav Link Header, grid exporlor, 入链链接
        // 检查是否匹配 closestList 中的选择器，并且符合 ge-grid-item 且不含 ge-folder-item
        if (closestList.some(selector => target.closest(selector) !== null)) {
            const element = target.closest('.ge-grid-item');
            if (element && element.classList.contains('ge-folder-item')) {
                return false;
            }
            return true;
        }

        const componentAncestor = target.closest('[class^="components"]');
        if (componentAncestor) {
            const hasLinkClass = target.classList.contains('internal-link') || target.classList.contains('external-link');
            if (hasLinkClass) {
                return true;
            }
            return false;
        }

        let current: Node | null = element;
        const selectorList = ['rect', 'img', 'svg'];
        if (selectorList.some(selector => target.matches(selector))) {
            // target 匹配列表中的某个选择器
            while (current) {
                if (current instanceof HTMLElement && current.classList.contains('internal-embed')) {
                    return true;
                }
                current = current.parentNode; // 通过 parentNode 穿透 SVG 元素层级
            }
        }

        const previewClasses = new Set([
            'excalidraw-hyperlinkContainer-link',
            'auto-card-link-card',
            'recent-files-title-content',
            'metadata-link-inner', // 属性面板
            'search-result-file-title', // 反向链接的搜索条目
            'search-result-file-matched-text', // 反向链接的搜索条目
            // 'has-folder-note',
            // 'homepage-button',
            // 'view-header-breadcrumb',
            // 'ge-grid-item',
            'internal-embed',
            'file-embed-title',
            'embed-title',
            'markdown-embed-link',
            'markdown-embed-content',
            // 'canvas-minimap',
            // 'svg',
        ]);

        return Array.from(element.classList).some(cls => previewClasses.has(cls) || cls.startsWith('excalidraw-svg'));
    }

    private handlePreviewModeLink(evt: MouseEvent, isAltClick: boolean) {
        let target = evt.target as HTMLElement;

        if (!isAltClick) {
            // // 添加调试信息
            // console.log("Checking exclude conditions for target:", target);
            // console.log("Exclude elements:", this.excludeElements);
            // console.log("Exclude containers:", this.excludeContainers);

            // if (this.excludeElements && this.excludeElements.some(selector => {
            //     const matches = target.matches(selector);
            //     console.log(`Checking element selector "${selector}":`, matches);
            //     return matches;
            // })) {
            //     console.log("Target matched excluded element - returning");
            //     return;
            // }

            // if (this.excludeContainers && this.excludeContainers.some(selector => {
            //     const closest = target.closest(selector);
            //     console.log(`Checking container selector "${selector}":`, closest);
            //     return closest;
            // })) {
            //     console.log("Target matched excluded container - returning");
            //     return;
            // }

            if (this.excludeElements && this.excludeElements.some(selector => target.matches(selector))) {
                return;
            }

            if (this.excludeContainers && this.excludeContainers.some(selector => target.closest(selector))) {
                return;
            }
        }

        let linkElement = target.closest('a');
        if (linkElement) {
            const closestList = ['.ge-grid-item', '.def-decoration'];
            const parentClass = closestList.find(selector => linkElement?.closest(selector));
            if (parentClass) {
                const closestElement = linkElement.closest(parentClass);
                if (!closestElement) return;  // 避免 null 访问 classList

                if (closestElement.classList.contains('def-decoration')) {
                    const tooltipLink = target ? target.closest('a[data-tooltip-position]') as HTMLElement : null;
                    if (tooltipLink) {
                        target = tooltipLink;
                      }
                }
            }
        }

        const embedElement = this.findClosestEmbedElement(target);
        if (embedElement) {
            target = embedElement;
        }

        // const link = this.getPreviewModeLinkText(target); // .replace(/^📁\s*/, "")
        let link = this.getPreviewModeLinkText(target).replace(/^\[\[(.*?)\]\]$/, "$1");
        // new Notice("link:" + link);

        if (target.closest('.metadata-link')) {
            const inputElement = target.closest('.metadata-link')?.parentElement?.querySelector('.metadata-input-longtext');
            const textContent = inputElement?.textContent;
            if (textContent) {
                link = textContent.replace(/^\[\[(.*?)\]\]$/, "$1").split('|')[0].trim() || '';
            }
        }

        if (target.closest('.outgoing-link-item')) { // 获取出链链接
            const treeItemIcon = target.closest('.outgoing-link-item')?.querySelector('.tree-item-icon');
            const subtext = target.closest('.outgoing-link-item')?.querySelector('.tree-item-inner-subtext')?.textContent?.trim() || '';
            const text = target.closest('.outgoing-link-item')?.querySelector('.tree-item-inner-text')?.textContent?.trim() || '';

            if (subtext) {
                if (treeItemIcon?.querySelector('.heading-glyph')) {
                    link = text ? `${subtext}#${text}` : subtext;
                } else if (treeItemIcon?.querySelector('.lucide-link')) {
                    link = text ? `${subtext}/${text}` : subtext;
                } else {
                    link = subtext;
                }
            }
        }

        if (target.closest('.bases-cards-item') || target.closest('.bases-cards-cover')) {
            const cardItem = target.closest('.bases-cards-item');  // 找到父级 item
            const cardLine = cardItem?.querySelector('.bases-cards-line');
            if (cardLine) {
                link = cardLine.textContent?.trim() || '';
            }
        }

        const singleClickType = !Platform.isMobile ? this.settings.typeOfClickTrigger : this.settings.typeOfClickTriggerOnMobile;
        if (!isAltClick) {
            if (this.isValidURL(link)) {
                if (singleClickType === 'internal') return;
            } else {
                if (singleClickType === 'external') return;
            }
        }

        evt.preventDefault();
        evt.stopImmediatePropagation();
        this.openInModalWindow(link);
    }

    private getPreviewModeLinkText(target: HTMLElement): string {
        // 如果 target 不是 ge-grid-item，查找最近的 ge-grid-item 父级
        const container = target.closest('.ge-grid-item') || target;

        // 处理note toolbar的外部链接元素
        if (target.closest('.callout-content')) {
            const externalLink = target.closest('.external-link');
            if (externalLink) {
                return externalLink.getAttribute('href') || '';
            }
        }

        // 如果点击的是别名部分
        if (container.classList.contains('cm-link-alias')) {
            const parentElement = container.parentElement;
            if (parentElement) {
                const originalLink = parentElement.querySelector('.cm-link-has-alias');
                if (originalLink) {
                    return originalLink.textContent?.trim() || '';
                }
            }
        }

        if (target.closest('.annotated-link')) {
            return container.textContent?.trim() || '';
        }

        // 支持 Simple Mind Map
        if (target.textContent?.includes("该文件中没有可预览图片")) {
            const span = target.closest("span.internal-embed");
            const div = target.closest("div.internal-embed");
            if (span) {
                return span.getAttribute('src') || '';
            }
            if (div) {
                return div.getAttribute('src') || '';
            }
        }
        if (target.tagName === 'IMG' && target.hasAttribute("data-smm-file")) {
            return target.getAttribute("data-smm-file") || '';
        }

        return container.getAttribute('data-file-path') ||
            container.getAttribute('filesource') ||
            container.getAttribute('data-path') ||
            container.getAttribute('data-href') ||
            container.getAttribute('href') ||
            container.getAttribute('src') ||
            container.textContent?.trim() || '';
    }

    private handleSourceModeLink(editor: Editor, evt: MouseEvent | TouchEvent, isAltClick: boolean) {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const linkMatch = this.findLinkAtPosition(line, cursor.ch);

        const singleClickType = !Platform.isMobile ? this.settings.typeOfClickTrigger : this.settings.typeOfClickTriggerOnMobile;
        const worksInReadMode = !Platform.isMobile ? this.settings.onlyWorksInReadMode : this.settings.onlyWorksInReadModeOnMobile;
        if (!isAltClick) {
            if (worksInReadMode) return;
            if (linkMatch && this.isValidURL(linkMatch)) {
                if (singleClickType === 'internal') return;
            } else {
                if (singleClickType === 'external') return;
            }
        }

        if (linkMatch) {
            if (linkMatch.trim().endsWith('.components')) {
                return;
            }
            evt.preventDefault();
            evt.stopImmediatePropagation();
            this.openInModalWindow(linkMatch);
        } else {
            let target = evt.target as HTMLElement;
            const embedElement = this.findClosestEmbedElement(target);
            if (embedElement) {
                if (this.isPreviewModeLink(target)) {
                    this.handlePreviewModeLink(evt as MouseEvent, isAltClick);
                }
            }
        }
        // new Notice(t("No link found at cursor position"));
    }

    private findLinkAtPosition(line: string, position: number): string | null {
        // 更新正则表达式以匹配所有可能的链接格式
        const linkRegex = /!?\[\[([^\]]+?)(?:\|[^\]]+?)?\]\]|\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s]+)|(www\.[^\s]+)|(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b)/g;
        let match;

        while ((match = linkRegex.exec(line)) !== null) {
            // 检查光标是否在整个链接范围内
            if (match.index < position && position < match.index + match[0].length) {
                // 如果是内部链接带别名的情况
                if (match[1] && match[1].includes("|")) {
                    // 只返回别名前的实际链接部分
                    return match[1].split("|")[0];
                }
                // 返回匹配到的第一个非空组(实际链接)
                return match[1] || match[3] || match[4] || match[5] || match[6] || null;
            }
        }
        return null;
    }

    private findClosestEmbedElement(element: Element): HTMLElement | null {
        // 先判断是否匹配某些特定的类
        if (
            element.classList.contains('canvas-minimap') ||
            element.classList.contains('file-embed-title') ||
            element.classList.contains('markdown-embed-link') ||
            element.closest('.ptl-tldraw-image-container, [data-viewport-type="element"], svg')
        ) {
            // 向上查找包含 'internal-embed' 类的父元素
            while (element) {
                if (element.classList?.contains('internal-embed')) {
                    return element as HTMLElement;
                }
                element = element.parentElement || element.parentNode as Element;
            }
        }
        return null;
    }

    private isValidURL = (url: string) =>
        ['http://', 'https://', 'www.', '192.', '127.'].some(prefix => url.startsWith(prefix));

    private isInFencedCodeBlock(editor: Editor, pos: EditorPosition): boolean {
        if (document.querySelector('.monaco-editor')) {
            return false;
        }

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

    public async openInModalWindow(link: string) {
        try {
            // console.log("OpenLink:", link);
            let rawLink = link.split('|')[0].trim(); 

            let filePath = rawLink;
            let fragment = "";

            if (rawLink.includes('#')) {
                [filePath, fragment] = rawLink.split('#');
            } else if (/\s>\s/.test(rawLink)) {
                const parts = rawLink.split(/\s>\s/);
                filePath = parts.shift()!.trim();
                const tail = parts.pop()!.trim();        // 取最后一段作为锚点
                fragment = tail.startsWith('^') ? `^${tail.slice(1)}` : tail;
            }

            // const fullLink = fragment ? `${filePath}#${fragment}` : filePath;
            // console.log(fullLink);
            // console.log(fragment);

            const abstractFile = this.app.metadataCache.getFirstLinkpathDest(filePath.trim(), "");

            let file: TFile | undefined;
            if (abstractFile instanceof TFile) {
                file = abstractFile;
            } else {
                file = undefined;
            }

            if (!file && !this.isValidURL(link)) {
                // new Notice(t("The file or link does not valid: ") + link);
                return;
            }

            new ModalWindow(
                this,
                link,
                file,
                fragment ?? ""
            ).open();
            this.isProcessing = true;
        } catch (error) {
            new Notice(t("Open in modal window error"));
        }
    }

    private async folderNoteOpenInModalWindow(link: string) {
        try {
            let file: TFile | undefined;
            const fileNameOnly = link.split(/[/\\]/).pop() || link;

            let abstractFile = this.app.vault.getAbstractFileByPath(`${link}/${fileNameOnly}.md`);
            if (abstractFile instanceof TFile) {
                file = abstractFile;
            } else {
                abstractFile = this.app.vault.getAbstractFileByPath(`${link}/${fileNameOnly}.canvas`);
                if (abstractFile instanceof TFile) {
                    file = abstractFile;
                } else {
                    const possibleFile = this.app.metadataCache.getFirstLinkpathDest(fileNameOnly, "");
                    if (possibleFile instanceof TFile) {
                        file = possibleFile;
                    }
                }
            }

            new ModalWindow(
                this,
                "",
                file,
                ""
            ).open();
            this.isProcessing = true;
        } catch (error) {
            new Notice(t("Open in modal window error"));
        }
    }

    // menu item
    private addFloatMenuItem(menu: Menu, link: string, title: string, onClick: () => void) {
        menu.addItem((item) =>
            item
                .setTitle(title)
                .setIcon("popup-open")
                .setSection("open")
                .onClick(onClick)
        );
    }

    private addLinkFloatMenuItem(menu: Menu, link?: string) {
        this.addFloatMenuItem(menu, link || '', t("Open in modal window"), () => {
            if (link) {
                // console.log("link");
                this.openInModalWindow(link);
            }
        });
    }

    private addFileFloatMenuItem(menu: Menu, link?: string) {
        this.addFloatMenuItem(menu, link || '', t("Open in modal window"), () => {
            if (link) {
                // console.log("file link: " + link);
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView) {
                    const mode = activeView.getMode();
                    let linkToPreview = link; // 默认为传入的 link
                    if (mode === 'source') {
                        const editor = activeView.editor;
                        const cursor = editor.getCursor();
                        const line = editor.getLine(cursor.line);
                        const foundLink = this.findLinkAtPosition(line, cursor.ch);
                        if (foundLink) {
                            linkToPreview = foundLink;
                        }
                    } else if (mode === 'preview') {
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                            const range = selection.getRangeAt(0);
                            const linkElement = range.startContainer.parentElement?.closest('a');
                            if (linkElement) {
                                linkToPreview = linkElement.getAttribute('data-href') || linkElement.getAttribute('href') || linkToPreview;
                            }
                        }
                    }
                    this.openInModalWindow(linkToPreview);
                } else {
                    this.openInModalWindow(link);
                }
            }
        });
    }

    private addFolderFloatMenuItem(menu: Menu, link?: string) {
        this.addFloatMenuItem(menu, link || '', t("Open in modal window"), () => {
            if (link) {
                // console.log("folder");
                this.folderNoteOpenInModalWindow(link);
            }
        });
    }

    private addCreateFileMenuItem(menu: Menu) {
        menu.addItem((item) => {
            item
                .setTitle(t('Create and edit in modal'))
                .setIcon('file-plus')
                .setSection('selection');

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
                            this.createFileAndEditInModal("md", true);
                        })
                );
            }

            const basesPlugin = (this.app as any).internalPlugins.getEnabledPluginById("bases");
            if (basesPlugin && this.settings.enabledCommands.bases) {
                group1Count++;
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Bases")
                        .setIcon("table")
                        .onClick(() => {
                            this.createFileAndEditInModal("base", false);
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
                            this.createFileAndEditInModal("canvas", false);
                        })
                );
            }

            // 如果第一组有项目，添加分隔线
            if (group1Count >= 1) {
                subMenu.addSeparator();
            }

            // 第二组：Excalidraw、Diagrams 和 Tldraw
            const pluginOriginal = this.getPlugin("obsidian-excalidraw-plugin");
            const pluginYMJR = this.getPlugin("obsidian-excalidraw-plugin-ymjr");
            const excalidrawPlugin = pluginOriginal || pluginYMJR;
            if (excalidrawPlugin && this.settings.enabledCommands.excalidraw) {
                group2Count++;
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Excalidraw")
                        .setIcon("swords")
                        .onClick(async () => {
                            const defaultNameWithExt = this.getDrawingFilename(excalidrawPlugin.settings);  // 默认文件名
                            const useExcalidrawExtension = excalidrawPlugin.settings.useExcalidrawExtension;
                            // const ext = useExcalidrawExtension ? ".excalidraw.md" : ".md";
                            // const defaultName = defaultNameWithExt.slice(0, -ext.length)

                            const result = await this.getNewFileName("", defaultNameWithExt);
                            if (!result) return;
                            const { fileName, isEmbed } = result;

                            if (excalidrawPlugin && excalidrawPlugin.settings) {
                                // 如果用户手动输入了名称，使用手动的 + 后缀；否则用默认生成的（默认生成的已含后缀）
                                const hasCustomName = fileName != defaultNameWithExt;
                                const excalidrawFileName = hasCustomName
                                    ? fileName + (useExcalidrawExtension ? ".excalidraw.md" : ".md")
                                    : defaultNameWithExt;

                                try {
                                    const file = await excalidrawPlugin.createDrawing(excalidrawFileName);
                                    const fileDirWithoutExt = file.path.replace(/\.excalidraw\.md$/, '').replace(/\.md$/, '');
                                    await this.insertLinkToPreviousView(useExcalidrawExtension ? fileDirWithoutExt + '.excalidraw' : fileDirWithoutExt + '.md');
                                    new ModalWindow(this, "", file, "").open();
                                } catch (e) {
                                    console.error("createExcalidrawFile failed:", e);
                                    new Notice(t("Failed to create file: ") + e.message);
                                }
                            }
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
                            diagramsPlugin.attemptNewDiagram()
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
                            const defaultName = tldrawPlugin.createDefaultFilename();  // 没输入时使用

                            const result = await this.getNewFileName("", defaultName + ".md");  // 弹出输入框
                            if (!result) return;
                            const { fileName, isEmbed } = result;

                            const hasCustomName = (fileName + ".md") != defaultName;
                            const tldrawFileName = hasCustomName ? fileName : defaultName;

                            if (tldrawPlugin && tldrawPlugin.settings) {
                                const fileDestinations = tldrawPlugin.settings.fileDestinations;
                                const destinationMethod = fileDestinations.destinationMethod;

                                let folderName: string;
                                switch (destinationMethod) {
                                    case "attachments-folder": {
                                        folderName = (this.app.vault as any).config.attachmentFolderPath ?? '/';
                                        break;
                                    }
                                    case "colocate": {
                                        folderName = tldrawPlugin.settings.fileDestinations.colocationSubfolder;
                                        break;
                                    }
                                    case "default-folder": {
                                        folderName = tldrawPlugin.settings.fileDestinations.defaultFolder;
                                        break;
                                    }
                                    default: {
                                        folderName = ''; // 可选：加个默认值兜底
                                        break;
                                    }
                                }
                                
                                try {
                                    const file = await tldrawPlugin.createTldrFile(tldrawFileName, {
                                        foldername: folderName,
                                        inMarkdown: true,
                                        tlStore: undefined
                                    });
                                    await this.insertLinkToPreviousView(file.path);
                                    new ModalWindow(this, "", file, "", "tldraw-view").open();
                                } catch (e) {
                                    console.error("createTldrFile failed:", e);
                                    new Notice(t("Failed to create file: ") + e.message);
                                }
                            }
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
                            const defaultName = this.getExcelFilename(excelPlugin.settings);  // 默认文件名
                            const result = await this.getNewFileName("", defaultName);
                            if (!result) return;
                            const { fileName, isEmbed } = result;

                            if (excelPlugin && excelPlugin.settings) {
                                // 如果用户手动输入了名称，使用手动的 + 后缀；否则用默认生成的（默认生成的已含后缀）
                                const hasCustomName = fileName !== defaultName;
                                const excelFileName = hasCustomName
                                    ? fileName + ".sheet.md"
                                    : fileName;
    
                                try {
                                    const file = await excelPlugin.createExcel(excelFileName);
                                    await this.insertLinkToPreviousView(file.path);
                                    new ModalWindow(this, "", file, "", "excel-view").open();
                                } catch (e) {
                                    console.error("createExcelFile failed:", e);
                                    new Notice(t("Failed to create file: ") + e.message);
                                }
                            }
                        })
                );
            }

            const sheetPlugin = this.getPlugin("sheet-plus");
            if (sheetPlugin && this.settings.enabledCommands.sheetPlus) {
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Sheet Plus")
                        .setIcon("grid")
                        .onClick(async () => {
                            const defaultName = this.getExcelProFilename(sheetPlugin.settings);  // 默认文件名
                            const result = await this.getNewFileName("", defaultName);
                            if (!result) return;
                            const { fileName, isEmbed } = result;

                            if (sheetPlugin && sheetPlugin.settings) {
                                // 如果用户手动输入了名称，使用手动的 + 后缀；否则用默认生成的（默认生成的已含后缀）
                                const hasCustomName = fileName !== defaultName;
                                const excelFileName = hasCustomName
                                    ? fileName + ".univer.md"
                                    : fileName;

                                try {
                                    const file = await sheetPlugin.createExcel(excelFileName);
                                    await this.insertLinkToPreviousView(file.path);
                                    new ModalWindow(this, "", file, "", "excel-pro-view").open();
                                } catch (e) {
                                    console.error("createExcelFile failed:", e);
                                    new Notice(t("Failed to create file: ") + e.message);
                                }
                            }
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
                            if (vscodePlugin && vscodePlugin.settings) {
                                const defaultLocation = vscodePlugin.settings.defaultLocation;
                                let tFolder: TFolder = this.app.vault.getRoot(); // 设置默认值为 root 文件夹

                                switch (defaultLocation) {
                                    case "root": {
                                        tFolder = this.app.vault.getRoot();
                                        break;
                                    }
                                    case "default": {
                                        const folderPath = (this.app.vault as any).getConfig("attachmentFolderPath");
                                        const folder = this.app.vault.getAbstractFileByPath(folderPath);
                                        if (folder instanceof TFolder) {
                                            tFolder = folder;
                                        }
                                        break;
                                    }
                                    case "custom": {
                                        const customPath = vscodePlugin.settings.customPath.replace(/\/$/, '');
                                        const customFolder = this.app.vault.getAbstractFileByPath(customPath);
                                        if (customFolder instanceof TFolder) {
                                            tFolder = customFolder;
                                        }
                                        break;
                                    }
                                    case "current": {
                                        const activeFile = this.app.workspace.getActiveFile();
                                        if (activeFile?.parent instanceof TFolder) {
                                            tFolder = activeFile.parent;
                                        }
                                        break;
                                    }
                                }
                                
                                await this.getNewCodeFileNameAndCreate(vscodePlugin.settings, tFolder);
                            }
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
                            try {
                                // console.log("Available commands:", Object.keys((this.app as any).commands.commands));
                                const activeFile = this.app.workspace.getActiveFile();
                                const filePath = activeFile?.path || "";
                                const parentFolder = this.app.fileManager.getNewFileParent(filePath);
                                
                                const lang = getLanguage();
                                const baseName = lang.startsWith("zh") ? "未命名思维导图" : "untitled mindmap";
                                const sourcePath = this.app.workspace.getActiveFile()?.path || "";
                                const folder = this.app.fileManager.getNewFileParent(sourcePath, `${baseName}.md`);
                                const availableFileName = await this.getAvailableFileName(baseName, "md", folder.path);

                                const result = await this.getNewFileName("", availableFileName);
                                if (!result) return;
                                const { fileName, isEmbed } = result;
                                
                                if (parentFolder) {
                                    const targetFolder = parentFolder || this.app.fileManager.getNewFileParent(
                                        this.app.workspace.getActiveFile()?.path || ""
                                    );

                                    const folderPath = targetFolder.path;

                                    const hasCustomName = fileName !== availableFileName;
                                    const markmindFileName = hasCustomName
                                        ? fileName + ".md"
                                        : fileName;

                                    const fullPath = `${folderPath}/${markmindFileName}`;
                                    
                                    // const file = await (this.app.fileManager as any).createNewMarkdownFile(targetFolder, fileName);
                                    const file = await this.app.vault.create(fullPath, "");

                                    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                                        if (markmindPlugin.settings.mindmapmode === "basic") {
                                            frontmatter["mindmap-plugin"] = "basic";
                                        } else {
                                            frontmatter["mindmap-plugin"] = "rich";
                                        }
                                    });
                                    
                                    await this.insertLinkToPreviousView(file.path);
                                    new ModalWindow(this, "", file, "", "mindmapview").open();
                                }
                            } catch (e) {
                                console.error("createMarkmindFile failed:", e);
                                new Notice(t("Failed to create file: ") + e.message);
                            }
                        })
                );
            }

            const simpleMindMapPlugin = this.getPlugin("simple-mind-map");
            if (simpleMindMapPlugin && this.settings.enabledCommands.simplemindmap) {
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Simple Mind Map")
                        .setIcon("brain-circuit")
                        .onClick(async () => {
                            await (this.app as any).commands.executeCommandById("simple-mind-map:create-smm-mindmap-insert-markdown");
                            setTimeout(() => {
                                const editor = this.app.workspace.activeEditor?.editor;
                                if (!editor) return;
                                const line = editor.getLine(editor.getCursor().line);
                                const match = line.match(/\[\[([^\]]+)\]\]/);
                                if (!match) return;
                                const filename = match[1];
                                const file = this.app.metadataCache.getFirstLinkpathDest(filename, "");
                                if (file) {
                                    new ModalWindow(this, "", file, "", "smm").open();
                                }
                            }, 100);
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

    private getDrawingFilename(settings: any): string {
        const prefix = settings.drawingFilenamePrefix || "";
        const datetime = settings.drawingFilenameDateTime
            ? window.moment().format(settings.drawingFilenameDateTime)
            : "";
        const extension = settings.compatibilityMode
            ? ".excalidraw"
            : settings.useExcalidrawExtension
                ? ".excalidraw.md"
                : ".md";

        return prefix + datetime + extension;
    }

    private getExcelFilename(settings: any): string {
        return (
            settings.excelFilenamePrefix +
            (settings.excelFilenameDateTime !== ""
                ? window.moment().format(settings.excelFilenameDateTime)
                : "") +
            ".sheet.md"
        );
    }

    private getExcelProFilename(settings: any): string {
        return (
            `${settings.excelFilenamePrefix
            + (settings.excelFilenameDateTime !== ''
                ? window.moment().format(settings.excelFilenameDateTime)
                : '')
            }.univer.md`
        )
    }

    private async insertLinkToPreviousView(filepath: string) {
        const previousView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const previousEditor = previousView?.editor ?? null;
        const previousCursor = previousEditor?.getCursor() ?? null;

        if (previousEditor && previousCursor) {
            const linkText = `![[${filepath}]]`;

            if (previousView) {
                this.app.workspace.setActiveLeaf(previousView.leaf, { focus: true });
                previousEditor?.replaceRange(linkText, previousCursor);
            }
            const newCursor = {
                line: previousCursor.line,
                ch: previousCursor.ch + linkText.length
            };
            previousEditor.setCursor(newCursor);
        }
    }

    private async getAvailableFileName(baseName: string, ext: string, folderPath: string): Promise<string> {
        let index = 0;
        let finalName = `${baseName}.${ext}`;
        let fullPath = folderPath === "/" ? finalName : `${folderPath}/${finalName}`;
        while (await this.app.vault.adapter.exists(fullPath)) {
            index += 1;
            finalName = `${baseName} ${index}.${ext}`;
            fullPath = folderPath === "/" ? finalName : `${folderPath}/${finalName}`;
        }
    
        return finalName;
    }

    private async getNewFileName(fileType: string, placeholder: string = ""): Promise<{ fileName: string, isEmbed: boolean } | null> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const selectedText = activeView?.editor?.getSelection() || '';

        const lang = getLanguage();
        const baseName = lang.startsWith("zh") ? "未命名" : "untitled";
        const sourcePath = this.app.workspace.getActiveFile()?.path || "";
        const folder = this.app.fileManager.getNewFileParent(sourcePath, `${baseName}.${fileType}`);
        const availableFileName = await this.getAvailableFileName(baseName, fileType, folder.path);
        const finalPlaceholder = placeholder?.trim() || availableFileName;

        return new Promise((resolve) => {
            const modal = new Modal(this.app);
            modal.titleEl.setText(t("Enter new file name"));

            const container = modal.contentEl.createDiv({ cls: 'new-file-modal-container' });
            const inputContainer = container.createDiv({ cls: 'new-file-input-container' });
            const input = inputContainer.createEl("input", {
                type: "text",
                value: selectedText,
                placeholder: finalPlaceholder,
                cls: 'new-file-input'
            });
            input.focus();
            input.select();

            let select: HTMLSelectElement;
            if (fileType == "md") {
                select = inputContainer.createEl("select", { cls: 'new-file-select' });
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
                const fileName = input.value.trim() || input.placeholder.trim();  // ← 如果没填，就用 placeholder
                if (fileName) {
                    resolve({
                        fileName: fileName,
                        isEmbed: select ? select.value === "embed" : true
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

    private async getNewCodeFileNameAndCreate(
        settings: { extensions: string[] },
        parent: TFolder | TFile
    ): Promise<TFile | null> {
        return new Promise((resolve) => {
            const modal = new Modal(this.app);
            modal.titleEl.setText(t("Enter new file name"));
    
            const container = modal.contentEl.createDiv({ cls: 'new-file-modal-container' });
            const inputContainer = container.createDiv({ cls: 'new-file-input-container' });

            const input = inputContainer.createEl("input", {
                type: "text",
                value: "",
                placeholder: "untitled code file",
                cls: "new-file-input"
            });
            input.focus();
            input.select();
    
            const select = inputContainer.createEl("select", { cls: "new-file-select" });
            settings.extensions.forEach(ext => {
                select.createEl("option", { text: ext, value: ext });
            });
            select.value = settings.extensions[0];
    
            const buttonContainer = container.createDiv({ cls: "new-file-button-container" });
    
            const confirmButton = buttonContainer.createEl("button", {
                text: t("Confirm"),
                cls: "new-file-button confirm"
            });
            const cancelButton = buttonContainer.createEl("button", {
                text: t("Cancel"),
                cls: "new-file-button cancel"
            });
    
            const complete = async () => {
                const fileName = input.value.trim() || input.placeholder.trim();
                const fileExtension = select.value;
                if (!fileName) return;
    
                modal.close();
    
                const baseFolder = (parent instanceof TFile ? parent.parent : parent) as TFolder;
                const newPath = normalizePath(`${baseFolder.path}/${fileName}.${fileExtension}`);
    
                const existingFile = this.app.vault.getAbstractFileByPath(newPath);
                if (existingFile && existingFile instanceof TFile) {
                    await this.app.workspace.getLeaf(true).openFile(existingFile);
                    resolve(existingFile);
                    return;
                }
    
                const file = await this.app.vault.create(newPath, "", {});
                await this.insertLinkToPreviousView(file.path);
                new ModalWindow(this, "", file, "", "vscode-editor").open();
                resolve(file);
            };
    
            confirmButton.onclick = complete;
    
            input.addEventListener("keydown", (e: KeyboardEvent) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    complete();
                }
            });
    
            cancelButton.onclick = () => {
                modal.close();
                resolve(null);
            };
    
            modal.open();
        });
    }

    private insertLinkToActiveFile(filePath: string, displayName: string, isEmbed: boolean, isAlias: boolean) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            const editor = activeView.editor;
            const selection = editor.getSelection();
            const linkText = `${isEmbed ? '!' : ''}[[${filePath}${isAlias ? `|${displayName}` : ''}]]`;
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

    private async createFileAndEditInModal(fileType: string, isAlias: boolean) {
        const result = await this.getNewFileName(fileType);
        if (!result) return;
        const { fileName, isEmbed } = result;
        
        const extensionsToRemove = [".md", ".canvas", ".base"];
        let cleanFileName = fileName;

        // 检查是否以指定后缀结尾
        for (const ext of extensionsToRemove) {
            if (cleanFileName.endsWith(ext)) {
                cleanFileName = cleanFileName.slice(0, -ext.length);
                break; // 一旦匹配就去掉，避免重复切割
            }
        }

        const activeFile = this.app.workspace.getActiveFile();
        const newFileName = `${cleanFileName}.${fileType}`
        // const folder = this.app.fileManager.getNewFileParent(sourcePath, cleanFileName);
        const sourcePath = this.app.workspace.getActiveFile()?.path || "";
        const folder = this.app.fileManager.getNewFileParent(sourcePath, `${cleanFileName}.${fileType}`);

        const newFilePath = folder.path === "/"
            ? newFileName
            : `${folder.path}/${newFileName}`;

        try {
            const newFile = await this.app.vault.create(newFilePath, '');
            const displayName = newFile.basename;
            isAlias ? this.insertLinkToActiveFile(newFilePath, displayName, isEmbed, true) : this.insertLinkToActiveFile(newFilePath, displayName, isEmbed, false);
            new ModalWindow(
                this,
                "",
                newFile,
                ""
            ).open();
        } catch (error) {
            new Notice(t("Failed to create file: ") + error.message);
        }
    }

    // no dupe leaf
    private async onActiveLeafChange(activeLeaf: RealLifeWorkspaceLeaf): Promise<void> {
        // 防抖处理：避免快速切换叶子时多次触发
        // if (this.activeLeafChangeTimeout) {
        //     clearTimeout(this.activeLeafChangeTimeout);
        // }

        if (activeLeaf?.view?.getViewType() === "webviewer") {
            const activeLeafEl = document.querySelector(".workspace-leaf.mod-active");
            if (activeLeafEl) {
                const webviewEl = activeLeafEl.querySelector("webview");

                if (webviewEl) {
                    webviewEl.addEventListener("dom-ready", () => {
                        this.registerWebAutoDarkMode(webviewEl);
                        // if (this.settings.enableWebAutoDarkMode) {
                        //     this.registerWebAutoDarkMode(webviewEl);
                        // }
                        // if (this.settings.enableImmersiveTranslation) {
                        //     this.registerImmersiveTranslation(webviewEl);
                        // }
                    });
                }
            }
        }

        // this.activeLeafChangeTimeout = setTimeout(async () => {
        //     // 状态锁定：确保同一时间只有一个处理流程
        //     if (!this.settings.preventsDuplicateTabs) {
        //         return;
        //     }
        //     if (this.isProcessing) {
        //         // console.log("正在处理其他叶子，跳过本次调用");
        //         if (!activeLeaf.view.containerEl.closest('.modal-opener')) {
        //             this.isProcessing = false;
        //         }
        //         return;
        //     }

        //     this.isProcessing = true; // 锁定状态

        //     try {
        //         const { id } = activeLeaf;
        //         if (this.processors.has(id)) {
        //             // console.log(`已经在处理叶子 ${id}`);
        //             return;
        //         }
        //         const processor = this.processActiveLeaf(activeLeaf);
        //         this.processors.set(id, processor);

        //         try {
        //             await processor;
        //         } finally {
        //             this.processors.delete(id);
        //             // console.log(`完成处理叶子 ${id}`);
        //         }
        //     } finally {
        //         this.isProcessing = false; // 释放状态锁定
        //     }
        // }, 100);
    }

    // private async processActiveLeaf(activeLeaf: RealLifeWorkspaceLeaf): Promise<void> {
    //     // 延迟处理，给予新页面加载的时间
    //     await new Promise(resolve => setTimeout(resolve, this.settings.delayInMs));

    //     const filePath = activeLeaf.view.getState().file;
    //     if (!filePath) return;

    //     const viewType = activeLeaf.view.getViewType();
    //     const duplicateLeaves = this.app.workspace.getLeavesOfType(viewType)
    //         .filter(l =>
    //             l !== activeLeaf &&
    //             l.view.getState().file === filePath &&
    //             (l as RealLifeWorkspaceLeaf).parent.id === activeLeaf.parent.id
    //         );

    //     if (duplicateLeaves.length === 0) return;

    //     // 根据活跃时间排序，最近活跃的在前
    //     const sortedLeaves = [activeLeaf, ...duplicateLeaves].sort((a, b) =>
    //         (b as any).activeTime - (a as any).activeTime
    //     );

    //     const mostRecentLeaf = sortedLeaves[0];
    //     const oldestLeaf = sortedLeaves[sortedLeaves.length - 1];

    //     // 如果当前叶子不是最近活跃的，我们需要进一步处理
    //     if (activeLeaf !== mostRecentLeaf) {
    //         // 如果当前叶子是最老的，我们应该保留它并关闭其他的
    //         if (activeLeaf === oldestLeaf) {
    //             for (const leaf of duplicateLeaves) {
    //                 if (!(leaf as any).pinned) {
    //                     leaf.detach();
    //                 }
    //             }
    //             this.app.workspace.setActiveLeaf(activeLeaf, { focus: true });
    //         } else {
    //             // 否则，我们应该关闭当前叶子
    //             if (activeLeaf.view.navigation && activeLeaf.history.backHistory.length > 0) {
    //                 activeLeaf.history.back();
    //             } else if (!(activeLeaf as any).pinned) {
    //                 activeLeaf.detach();
    //             }
    //             this.app.workspace.setActiveLeaf(mostRecentLeaf, { focus: true });
    //         }
    //     } else {
    //         // 当前叶子是最近活跃的，我们应该保留它并关闭其他的
    //         for (const leaf of duplicateLeaves) {
    //             if (!(leaf as any).pinned) {
    //                 leaf.detach();
    //             }
    //         }
    //     }
    // }

    async registerWebAutoDarkMode(webContents: any) {
        try {
            const isDarkMode = document.body.classList.contains('theme-dark');
            if (isDarkMode) {
                try {
                    await webContents.executeJavaScript(`
						const element = document.createElement('script');

						fetch('https://cdn.jsdelivr.net/npm/darkreader/darkreader.min.js')
							.then((response) => {
								element.src = response.url;
								document.body.appendChild(element);
							})
							.catch((error) => {
								console.error('Error loading the script:', error);
							});

						element.onload = () => {
							try {
								DarkReader?.setFetchMethod(window.fetch);
								DarkReader?.enable({
									brightness: 100,
									contrast: 90,
									sepia: 10
								});
								console.log(DarkReader);
							} catch (err) {
								window.myPostPort?.postMessage('darkreader-failed');
								console.error('Failed to load dark reader: ', err);
							}
						};
					`);
                } catch (e) {
                    console.error(e);
                }
            } else {
                try {
                    await webContents.executeJavaScript(`
                        if (DarkReader) {
                            DarkReader.disable();
                            console.log('Dark mode disabled');
                        }
                    `);
                } catch (e) {
                    console.error('Error disabling dark mode: ', e);
                }
            }
        } catch (err) {
            console.error("Failed to get background color: ", err);
        }

        // https://cdn.jsdelivr.net/npm/darkreader/darkreader.min.js
        webContents.executeJavaScript(`
			window.addEventListener('mouseover', (e) => {
				if(!e.target) return;
				if(!e.ctrlKey && !e.metaKey) return;
				// Tag name is a tag
				if(e.target.tagName.toLowerCase() === 'a'){
					window.myPostPort?.postMessage('link ' + e.clientX + ' ' + e.clientY + ' ' + e.target.href);
				}
			});
		`);
    }

    // async registerImmersiveTranslation(webContents: any) {
    //     // 注入沉浸式翻译 SDK
    //     await webContents.executeJavaScript(`
    //         // 1. 设置初始化参数
    //         window.immersiveTranslateConfig = {
    //             isAutoTranslate: false,
    //             pageRule: {
    //                 // 排除不需要翻译的元素
    //                 excludeSelectors: ["pre", "code", "nav", "footer"],
    //             }
    //         };

    //         // 2. 加载沉浸式翻译 SDK
    //         const script = document.createElement('script');
    //         script.async = true;
    //         script.src = 'https://download.immersivetranslate.com/immersive-translate-sdk-lite-latest.js';
    //         document.head.appendChild(script);
    //     `);
    // }

    public getPlugin(pluginId: string) {
        const app = this.app as any;
        return app.plugins.plugins[pluginId];
    }
}
