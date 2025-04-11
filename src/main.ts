import { Plugin, Menu, TAbstractFile, Notice, TFile, MenuItem, Editor, MarkdownView, Modal, EditorPosition, WorkspaceLeaf, Platform } from "obsidian";
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

        this.documentClickHandler = (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const { altKey, ctrlKey } = evt;
            const singleClick = !Platform.isMobile ? this.settings.clickWithoutAlt : this.settings.clickWithoutAltOnMobile;
            const singleClickType = !Platform.isMobile ? this.settings.typeOfClickTrigger : this.settings.typeOfClickTriggerOnMobile;

            if(target instanceof HTMLAnchorElement && target.href && this.isValidURL(target.href)) {
                if ((altKey && !ctrlKey) || 
                    (singleClick && !altKey && !ctrlKey && singleClickType !== 'internal')) {
                    evt.preventDefault();
                    evt.stopImmediatePropagation();
                    this.openInFloatPreview(target.href);
                }

                if (ctrlKey && !altKey && this.webviewPlugin) {
                    evt.preventDefault();
                    evt.stopImmediatePropagation();
                    (window as any).require("electron").shell.openExternal(target.href);
                }
            }
        };
        
        document.addEventListener("click", this.documentClickHandler, true);
    
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
        document.body.classList.toggle('modal-animation-enabled', this.settings.enableAnimation);
        document.body.classList.toggle('modal-rounding-enabled', this.settings.enableRounding);
        document.body.classList.toggle('show-file-view-header', this.settings.showFileViewHeader);
        document.body.classList.toggle('show-link-view-header', this.settings.showLinkViewHeader);
        document.body.classList.toggle('show-metadata', this.settings.showMetadata);
        document.body.classList.toggle('hider-scroll', !this.settings.hideScroll);
    }

    onunload() {
        this.app.workspace.off("active-leaf-change", this.onActiveLeafChange.bind(this));
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

        new ModalWindow (
            this,
            linkValue,
            file instanceof TFile ? file : undefined,
            ""
        ).open();
        this.isProcessing = true;
    }

    private toggleBackgroundBlur() {
        this.settings.enableAnimation = !this.settings.enableAnimation;
        document.body.classList.toggle('modal-animation-enabled', this.settings.enableAnimation);
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
            this.openInFloatPreview(command);
        } else {
            const abstractFile = this.app.vault.getAbstractFileByPath(command);
            if (abstractFile instanceof TFile) {
                this.openInFloatPreview(command);
            } else {
                const file = this.app.metadataCache.getFirstLinkpathDest(command, "");
                if (file instanceof TFile) {
                    this.openInFloatPreview(command);
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
                let parentPath = "";
                if (view.file && view.file.parent) {
                    parentPath = view.file.parent.path;
                }

                if (this.settings.showDeleteCommands) {
                    this.addDeleteAttachmentMenuItem(menu, editor);
                }

                if (this.settings.showCommandsContainer) {
                    this.addCreateFileMenuItem(menu, parentPath);
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

            const singleClick = !Platform.isMobile ? this.settings.clickWithoutAlt : this.settings.clickWithoutAltOnMobile;
            const singleClickType = !Platform.isMobile ? this.settings.typeOfClickTrigger : this.settings.typeOfClickTriggerOnMobile;
            const isAltClick = evt.altKey && evt.button === 0;

            // 检查是否应该触发处理
            if (!isAltClick && !singleClick) return;
            if (editor && editor.somethingSelected()) return;
            if (!(evt.button === 0 && (!evt.ctrlKey || evt.altKey))) return;

            // 检查特殊元素 diagram.svg
            if (target.getAttribute("alt")?.endsWith(".svg")) return;

            if(singleClick && !isAltClick && singleClickType !== 'external') {
                const currentFilePath = this.app.workspace.getActiveFile()?.path;
                // console.log("Exclude Files:", excludeFiles);
                // console.log("Current File:", this.app.workspace.getActiveFile()?.path);
            
                if (currentFilePath && this.excludeFiles.length > 0) {
                    const isExcluded = this.excludeFiles.some(file => currentFilePath === file);
                    if (isExcluded) {
                        return;
                    }
                }
            }

            // 处理链接点击
            if (this.isPreviewModeLink(target)) {
                // new Notice("isPreviewModeLink: " + target.tagName);
                this.handlePreviewModeLink(evt, isAltClick);
            } else if (activeView instanceof MarkdownView && activeView.getMode() === 'source') {
                if (target.closest('.markdown-source-view') || target.classList.contains('cm-link')) {
                    this.handleSourceModeLink(activeView.editor, evt, isAltClick);
                }
                // 处理编辑器中的代码块
                if (this.isInFencedCodeBlock(activeView.editor, activeView.editor.getCursor())) {
                    if ((!singleClick) || (singleClick && isAltClick)) {
                        (this.app as any).commands.executeCommandById("vscode-editor:edit-fence");
                    }
                }
            }
        };
        document.addEventListener('click', this.altClickHandler, { capture: true });
    }

    private isPreviewModeLink(target: HTMLElement): boolean {
        const element = target;
        
        if (element.tagName === 'A' && (element.classList.contains('external-link') || element.classList.contains('internal-link'))) {
            return true;
        }

        // 支持出链链接
        if (element.closest('.search-result-file-title .tree-item-inner')) {
            return true;
        }

        // 支持反向链接的更多内容
        if (element.tagName === 'SPAN' && element.closest('.search-result-file-match')) {
            return true;
        }

        const hasDefDecoration = element.querySelector('.def-decoration') !== null;
        if (hasDefDecoration || target.closest('.def-decoration')) {
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

        const singleClickType = !Platform.isMobile ? this.settings.typeOfClickTrigger : this.settings.typeOfClickTriggerOnMobile;
        if (!isAltClick) {
            if(this.isValidURL(link)) {
                if(singleClickType === 'internal') return;
            } else {
                if(singleClickType === 'external') return;
            }
        }

        evt.preventDefault();
        evt.stopImmediatePropagation();
        this.openInFloatPreview(link);
    }

    private getPreviewModeLinkText(target: HTMLElement): string {
        // 如果 target 不是 ge-grid-item，查找最近的 ge-grid-item 父级
        const container = target.closest('.ge-grid-item') || target;
    
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
            if(worksInReadMode) return;
            if(linkMatch && this.isValidURL(linkMatch)) {
                if(singleClickType === 'internal') return;
            } else {
                if(singleClickType === 'external') return;
            }
        }
        
        if (linkMatch) {
            if (linkMatch.trim().endsWith('.components')) {
                return;
            }
            evt.preventDefault();
            evt.stopImmediatePropagation();
            this.openInFloatPreview(linkMatch);
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
            if (match.index <= position && position <= match.index + match[0].length) {
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
            element.closest('.ptl-tldraw-image-container, .dataloom-padding, .dataloom-bottom-bar, [data-viewport-type="element"], svg')
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

    private async openInFloatPreview(link: string) {
        try {
            // console.log("OpenLink:", link);
            const [linkWithoutAlias] = link.split('|');
            const [filePath, fragment] = linkWithoutAlias.split('#');
            const abstractFile = this.app.metadataCache.getFirstLinkpathDest(filePath, "");

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

            new ModalWindow (
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

    private async folderNoteOpenInFloatPreview(link: string) {
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

            new ModalWindow (
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
                this.openInFloatPreview(link);
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
                    this.openInFloatPreview(linkToPreview);
                } else {
                    this.openInFloatPreview(link);
                }
            }
        });
    }

    private addFolderFloatMenuItem(menu: Menu, link?: string) {
        this.addFloatMenuItem(menu, link || '', t("Open in modal window"), () => {
            if (link) {
                // console.log("folder");
                this.folderNoteOpenInFloatPreview(link);
            }
        });
    }

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
                            this.createFileAndEditInModal("md", true);
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
            const excalidrawPlugin = this.getPlugin("obsidian-excalidraw-plugin");
            const excalidrawymjrPlugin = this.getPlugin("obsidian-excalidraw-plugin-ymjr");
            if ((excalidrawPlugin || excalidrawymjrPlugin) && this.settings.enabledCommands.excalidraw) {
                group2Count++;
                subMenu.addItem((subItem: MenuItem) =>
                    subItem
                        .setTitle("Excalidraw")
                        .setIcon("swords")
                        .onClick(async () => {
                            // console.log("Available commands:", Object.keys((this.app as any).commands.commands));
                            // const initialLeafCount = this.app.workspace.getLeavesOfType('excalidraw').length;
                            let commandId;
                            if (excalidrawPlugin) {
                                commandId = "obsidian-excalidraw-plugin:excalidraw-autocreate-newtab";
                            } else if (excalidrawymjrPlugin) {
                                commandId = "obsidian-excalidraw-plugin-ymjr:excalidraw-autocreate-newtab";
                            }
                            // (this.app as any).commands.executeCommandById(commandId);
                            // const waitForNewLeaf = () => {
                            //     return new Promise<void>((resolve) => {
                            //         const checkLeaf = () => {
                            //             const currentLeafCount = this.app.workspace.getLeavesOfType('excalidraw').length;
                            //             if (currentLeafCount > initialLeafCount) {
                            //                 resolve();
                            //             } else {
                            //                 setTimeout(checkLeaf, 50);
                            //             }
                            //         };
                            //         checkLeaf();
                            //     });
                            // };

                            // await waitForNewLeaf();
                            // setTimeout(() => {
                            //     this.openContentInModal();
                            // }, this.settings.modalOpenDelay);
                            if (commandId) {
                                await this.createFileAndInsertLink(commandId, true, false);
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
                            // await (this.app as any).commands.executeCommandById("tldraw:embed-new-tldraw-file-.md-new-tab");
                            // setTimeout(() => {
                            //     this.openContentInModal();
                            // },  this.settings.modalOpenDelay);

                            await this.createFileAndInsertLink("tldraw:new-tldraw-file-.md-new-tab", true, false);
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
                            await this.createFileAndInsertLink("excel:excel-autocreate", true, false);
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
                            await this.createFileAndInsertLink("sheet-plus:spreadsheet-autocreation", true, false);
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
                            await this.createFileAndInsertLink("obsidian-markmind:Create New MindMap", true, false);
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
                            await this.createFileAndInsertLink("notion-like-tables:create", true, false);
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

    private async createFileAndInsertLink(commandId: string, isEmbed: boolean, isAlias: boolean) {
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
            const linkText = `${isEmbed ? '!' : ''}[[${filePath}${isAlias ? `|${fileName}` : ''}]]`;

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

        setTimeout(() => {
            this.openContentInModal();
        }, this.settings.modalOpenDelay);
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
            const observer = new MutationObserver((mutations, obs) => {
                for (const mutation of mutations) {
                    for (const node of Array.from(mutation.addedNodes)) {
                        if (node instanceof HTMLElement && node.classList.contains('modal-container')) {
                            const confirmButton = node.querySelector('.mod-cta');
                            const inputElement = node.querySelector('input');
                            let selectElement = node.querySelector('.modal_select') as HTMLSelectElement;
                            const codePlugin = this.getPlugin("code-files");
                            if (codePlugin) {
                                selectElement = node.querySelector('.dropdown') as HTMLSelectElement;
                            }

                            if (confirmButton && inputElement && selectElement) {
                                confirmButton.addEventListener('click', () => {
                                    const fileName = inputElement.value;
                                    const fileExtension = selectElement.value;

                                    if (fileName) {
                                        const fullFileName = `${fileName}.${fileExtension}`;
                                        this.insertCodeFileLink(fullFileName, "");
                                        setTimeout(() => {
                                            this.openContentInModal();
                                        }, 200);
                                    }

                                    obs.disconnect();
                                    resolve();
                                });
                            }
                            return;
                        }
                    }
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
            (this.app as any).commands.executeCommandById("vscode-editor:create");
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
            setTimeout(() => {
                const file = this.app.metadataCache.getFirstLinkpathDest(`${filePath}`, "");
                if (file && file instanceof TFile) {
                    const editor = activeView.editor;
                    const cursor = editor.getCursor();
                    const linkText = `![[${file.path}]]`;
                    editor.replaceRange(linkText, cursor);
                }
            }, 200);
        }
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
        const activeFile = this.app.workspace.getActiveFile();
        const sourcePath = activeFile ? activeFile.path : "";
        const newFileName = `${fileName}.${fileType}`
        const folder = this.app.fileManager.getNewFileParent(sourcePath, newFileName);
        const newFilePath = folder.path === "/"
                            ? newFileName
                            : `${folder.path}/${newFileName}`;

        try {
            const newFile = await this.app.vault.create(newFilePath, '');
            const displayName = newFile.basename;
            isAlias ? this.insertLinkToActiveFile(newFilePath, displayName, isEmbed, true) : this.insertLinkToActiveFile(newFilePath, displayName, isEmbed, false);
            new ModalWindow (
                this,
                "",
                newFile,
                ""
            ).open();
            this.isProcessing = true;
        } catch (error) {
            new Notice(t("Failed to create file: ") + error.message);
        }
    }

    // no dupe leaf
    private async onActiveLeafChange(activeLeaf: RealLifeWorkspaceLeaf): Promise<void> {
        // 防抖处理：避免快速切换叶子时多次触发
        if (this.activeLeafChangeTimeout) {
            clearTimeout(this.activeLeafChangeTimeout);
        }
        
        if (activeLeaf?.view?.getViewType() === "webviewer") {
            const activeLeafEl = document.querySelector(".workspace-leaf.mod-active");
            if (activeLeafEl) {
                const webviewEl = activeLeafEl.querySelector("webview");
        
                if (webviewEl) {
                    webviewEl.addEventListener("dom-ready", () => {
                        if(this.settings.enableWebAutoDarkMode) {
                            this.registerWebAutoDarkMode(webviewEl);
                        }
                        if(this.settings.enableImmersiveTranslation) {
                            this.registerImmersiveTranslation(webviewEl);
                        }
                    });
                }
            }
        }

        this.activeLeafChangeTimeout = setTimeout(async () => {
            // 状态锁定：确保同一时间只有一个处理流程
            if (!this.settings.preventsDuplicateTabs) {
                return;
            }
            if (this.isProcessing) {
                // console.log("正在处理其他叶子，跳过本次调用");
                if (!activeLeaf.view.containerEl.closest('.modal-opener')) {
                    this.isProcessing = false;
                }
                return;
            }

            this.isProcessing = true; // 锁定状态

            try {
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
            } finally {
                this.isProcessing = false; // 释放状态锁定
            }
        }, 100);
    }

    private async processActiveLeaf(activeLeaf: RealLifeWorkspaceLeaf): Promise<void> {
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

    async registerImmersiveTranslation(webContents: any) {
        // 注入沉浸式翻译 SDK
        await webContents.executeJavaScript(`
            // 1. 设置初始化参数
            window.immersiveTranslateConfig = {
                isAutoTranslate: false,
                pageRule: {
                    // 排除不需要翻译的元素
                    excludeSelectors: ["pre", "code", "nav", "footer"],
                }
            };

            // 2. 加载沉浸式翻译 SDK
            const script = document.createElement('script');
            script.async = true;
            script.src = 'https://download.immersivetranslate.com/immersive-translate-sdk-latest.js';
            document.head.appendChild(script);
        `);
	}

    public getPlugin(pluginId: string) {
        const app = this.app as any;
        return app.plugins.plugins[pluginId];
    }
}