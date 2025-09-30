import { Modal, TFile, WorkspaceLeaf, MarkdownView, ViewState, Scope, requestUrl, RequestUrlResponse, setIcon, Platform, Notice, MarkdownRenderer } from "obsidian";
import ModalOpenerPlugin from "./main";
import { t } from "./lang/helpers"

export class ModalWindow extends Modal {
    plugin: ModalOpenerPlugin;
    leaf?: WorkspaceLeaf;
    link: string;
    file?: TFile;
    fragment: string;
    viewType?: string;
    public scope: Scope;
    private modalLeafRef?: WorkspaceLeaf;
    private prevActiveLeaf?: WorkspaceLeaf;
    private static instances: ModalWindow[] = [];
    private static activeInstance: ModalWindow | null = null;
    private boundHandleActiveLeafChange: () => void;
    private boundHandleInternalLinkClick: (event: MouseEvent) => void;

    private updateFragmentLink: boolean;
    private observer: MutationObserver | null = null;
    private webviewPlugin: boolean;
    private hideTimeout: NodeJS.Timeout;

    constructor(plugin: ModalOpenerPlugin, link: string, file?: TFile, fragment?: string, viewType?: string) {
        super(plugin.app);
        this.plugin = plugin;
        this.link = link;
        this.file = file;
        this.fragment = fragment || '';
        this.viewType = viewType;
        this.scope = new Scope(this.app.scope); // Allow app commands to work inside modal
        this.webviewPlugin = (this.app as any).internalPlugins.getEnabledPluginById("webviewer");
        this.boundHandleActiveLeafChange = this.handleActiveLeafChange.bind(this);
        this.boundHandleInternalLinkClick = this.handleInternalLinkClick.bind(this);

        ModalWindow.instances.push(this);
        ModalWindow.activeInstance = this;
        ModalOpenerPlugin.activeModalWindow = this;

        const modalElement = this.containerEl.querySelector('.modal');
        if (modalElement) {
            modalElement.addClass('modal-opener');
        }
        const modalBgElement = this.containerEl.querySelector('.modal-bg');
        if (modalBgElement) {
            modalBgElement.addClass('modal-opener-bg');
        }
    }

    async onOpen() {
        if (!this.contentEl) {
            return;
        }

        this.prevActiveLeaf = this.app.workspace.getMostRecentLeaf() ?? undefined;

        this.modalLeafRef = this.app.workspace.createLeafInParent(
            this.app.workspace.rootSplit,
            0
        );

        if (this.modalLeafRef) {
            (this.modalLeafRef as any).containerEl.style.display = "none";
        }

        const modalBgElement = this.containerEl.querySelector(".modal-bg.modal-opener-bg");
        if (modalBgElement) {
            if (this.plugin.settings.onlyCloseButton) {
                modalBgElement.classList.remove('closable');
            } else {
                modalBgElement.classList.add('closable');
            }
        }

        const modal = this.containerEl.lastChild as HTMLElement;
        const modalWidth = !Platform.isMobile ? this.plugin.settings.modalWidth : this.plugin.settings.modalWidthOnMobile;
        const modalHeight = !Platform.isMobile ? this.plugin.settings.modalHeight : this.plugin.settings.modalHeightOnMobile;
        if (modal) {
            modal.style.width = modalWidth;
            modal.style.height = modalHeight;
        }

        if (this.file) {
            // console.log("file", this.file);
            this.displayFileContent(this.file, this.fragment);
        } else {
            if (!this.link.startsWith('http://') && !this.link.startsWith('https://')) {
                const httpsLink = `https://${this.link}`;
                if (await this.checkURLReachability(httpsLink)) {
                    this.link = httpsLink;
                } else {
                    this.link = `http://${this.link}`;
                }
            }
            // console.log("link", this.link);
            this.displayLinkContent(this.link);
        }

        // 恢复 ESC 键的默认行为
        this.scope.register([], 'Escape', async (evt: KeyboardEvent) => {
            evt.preventDefault(); // 先阻止默认关闭
            const excalidrawView = this.app.workspace.getLeavesOfType("excalidraw").first()?.view;
            if (this.plugin.settings.disableExcalidrawEsc && excalidrawView) return;
            this.close();
        });

        this.containerEl.addEventListener('click', this.boundHandleInternalLinkClick, true);
        if (this.plugin.settings.doubleClickToEdit) {
            this.containerEl.addEventListener('dblclick', (evt) => {
                if(this.modalLeafRef) {
                    const view = this.modalLeafRef.view;
                    if (view instanceof MarkdownView && view.getMode() === "preview") {
                        // Prevent default behavior
                        evt.preventDefault();
                        evt.stopPropagation();

                        // Execute the toggle edit/preview mode command
                        (this.app as any).commands.executeCommandById("markdown:toggle-preview");
                    }
                }
            });
        }
        setTimeout(() => {
            if (ModalWindow.activeInstance === this) {
                this.app.workspace.on('active-leaf-change', this.boundHandleActiveLeafChange);
            }
        }, 100);
    }

    close() {
        const smmView = this.app.workspace.getLeavesOfType("smm").first()?.view;
        if (smmView) {
            (this.app as any).commands.executeCommandById("simple-mind-map:save-smm-mindmap-and-update-image");
            setTimeout(() => {
                this.doClose();
            }, 500);
        } else {
            this.doClose();
        }
    }

    private doClose() {
        super.close();
        this.app.workspace.off('active-leaf-change', this.boundHandleActiveLeafChange);
        this.containerEl.removeEventListener('click', this.boundHandleInternalLinkClick, true);
        ModalWindow.instances = ModalWindow.instances.filter(instance => instance !== this);
        if (ModalWindow.activeInstance === this) {
            ModalWindow.activeInstance = ModalWindow.instances[ModalWindow.instances.length - 1] || null;
        }
        if (ModalOpenerPlugin.activeModalWindow === this) {
            ModalOpenerPlugin.activeModalWindow = ModalWindow.instances[ModalWindow.instances.length - 1] || null;
        }
    }

    onClose() {
        // 在关闭模态窗口之前检查 data-type，只在特定类型下需要刷新 ModalWindow.instances.length == 1 && 
        let leafContent: HTMLElement | null = null;
        let modalContent: HTMLElement | null = null;
        let dataType: string | null = null;
        let isWebView: boolean = false;

        if (ModalWindow.activeInstance) {
            leafContent = ModalWindow.activeInstance.containerEl.querySelector('.workspace-leaf-content');
            if(leafContent) {
                dataType = leafContent.getAttribute('data-type');
            }

            modalContent = ModalWindow.activeInstance.containerEl.querySelector('.modal-content');
            if(modalContent) {
                const dataSrc = modalContent.getAttribute('data-src');
                if (dataSrc) {
                    isWebView = this.isValidURL(dataSrc);
                }
            }
        }

        if (ModalWindow.instances.length === 1 && (dataType == "markdown" || isWebView)) {
            setTimeout(() => {
                this.exitMultiCursorMode();
            }, 100);
        }
        
        if (this.plugin.settings.enableRefreshOnClose && (dataType == "canvas" || dataType == "mindmapview" || dataType == "smm")) {
            setTimeout(() => {
                this.refreshMarkdownViews();
            }, 100);
        }

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        const { contentEl } = this;
        contentEl.empty();

        if (this.modalLeafRef) {
            this.modalLeafRef.detach();
            this.modalLeafRef = undefined;
        }

        // 恢复之前的活动叶子
        if (this.prevActiveLeaf) {
            this.app.workspace.setActiveLeaf(this.prevActiveLeaf);
        }
    }
    
    private async displayFileContent(file: TFile, fragment: string) {
        if (!this.contentEl) {
            return;
        }

        this.contentEl.empty();
        this.contentEl.setAttribute("data-src", file.path + (fragment ? '#' + fragment : ''));
        const fileContainer = this.contentEl.createEl("div", "modal-opener-content");

        let mode;
        switch (this.plugin.settings.fileOpenMode) {
            case 'source':
                mode = 'source';
                break;
            case 'preview':
                mode = 'preview';
                break;
            default:
                mode = (this.prevActiveLeaf?.view instanceof MarkdownView) && this.prevActiveLeaf.view.getMode() === 'source' ? 'source' : 'preview';
        }

        const previewTypes = ["excel-view", "tldraw-view", "mindmapview", "smm", "dataloom"];
        if (this.modalLeafRef) {
            await this.modalLeafRef.openFile(file, { state: { mode } });
            fileContainer.appendChild(this.modalLeafRef.view.containerEl);

            if (fragment) {
                const filePath = `${file.path}#${fragment}`;
                this.app.workspace.openLinkText(filePath, file.path, false);
                // setTimeout(() => {
                //     this.app.workspace.openLinkText(filePath, file.path, false);
                // }, 100);
            }

            if (this.plugin.settings.showFloatingButton) {
                if (this.plugin.settings.viewOfDisplayButton == 'both' || this.plugin.settings.viewOfDisplayButton == 'file') {
                    const viewType = this.modalLeafRef.view.getViewType();
                    if (viewType === 'markdown') {
                        this.addTocButton(this.contentEl, file.path);
                    }
                    this.addOpenInNewLeafButton(this.contentEl);
                }
            }

            if(this.viewType && previewTypes.includes(this.viewType)) {
                this.modalLeafRef.setViewState({
                    type: this.viewType,
                    state: { file: file },
                });
            }
            // 支持Simple Mind Map
            const parts = file.path.split(".");
            const ext = parts.slice(-2).join(".");
            if(ext === "smm.md") {
                this.modalLeafRef.setViewState({
                    type: "smm",
                    state: { file: file },
                });
            }
        }

        this.setupDoubleClickHandler();
        this.setContainerHeight(fileContainer, false);

        const noteToolbarPlugin = this.getPlugin("note-toolbar");
        if (noteToolbarPlugin) {
            this.setupToolbarObserver();
        }

        this.contentEl.tabIndex = -1;
        this.contentEl.focus();
    }

    private async displayLinkContent(link: string) {
        if (!this.contentEl) {
            return;
        }

        this.contentEl.empty();
        this.contentEl.setAttribute("data-src", this.link);

        const linkContainer = this.contentEl.createEl("div", "modal-opener-content"); 
        if (this.plugin.settings.showFloatingButton) {
            if (this.plugin.settings.viewOfDisplayButton == 'both' || this.plugin.settings.viewOfDisplayButton == 'link') {
                this.addFloatingButton(this.contentEl);
            }
        }

        if (this.webviewPlugin && this.modalLeafRef) {
            this.loadSiteByWebViewer(link, this.modalLeafRef);
            linkContainer.appendChild(this.modalLeafRef.view.containerEl);
        } else {
            if (Platform.isMobile) {
                const frame = linkContainer.createEl("iframe", { cls: "modal-iframe" });
                frame.src = link;
            } else {
                this.createWebview(this.contentEl, linkContainer);
            }
        }

        this.setupDoubleClickHandler();
        this.setContainerHeight(linkContainer, true);
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

        return container.getAttribute('data-file-path') ||
            container.getAttribute('filesource') ||
            container.getAttribute('data-path') ||
            container.getAttribute('data-href') ||
            container.getAttribute('href') ||
            container.getAttribute('src') ||
            container.textContent?.trim() || '';
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

    private handleInternalLinkClick(event: MouseEvent) {
        let target = event.target as HTMLElement;

        const embedElement = this.findClosestEmbedElement(target);
        if (embedElement) {
            target = embedElement;
        }

        // console.log(target);
        if (!target.closest('.workspace-leaf-content') || target.closest('.view-header')) return;
        if (target.closest('.workspace-leaf-content[data-type="excalidraw"]')) return;
        if (target.closest('.workspace-leaf-content[data-type="tldraw-view"]')) return;
        if (target.closest('.workspace-leaf-content[data-type="canvas"]')) return;
        if (target.closest('.workspace-leaf-content[data-type="excel-view"]')) return;
        if (target.closest('.workspace-leaf-content[data-type="excel-pro-view"]')) return;
        if (target.closest('.workspace-leaf-content[data-type="mindmapview"]')) return;
        if (target.closest('.workspace-leaf-content[data-type="smm"]')) return;

        let linkText = "";
        const activeView = this.modalLeafRef?.view;
        
        if(activeView instanceof MarkdownView) {
            if (activeView.getMode() === 'source') { // 编辑模式下的处理逻辑
                const editor = activeView.editor;
                const cursor = editor.getCursor();
                const line = editor.getLine(cursor.line);
                linkText = this.findLinkAtPosition(line, cursor.ch) || '';
                if(!linkText) {
                    linkText = this.getPreviewModeLinkText(target);
                }
            } else {
                linkText = this.getPreviewModeLinkText(target);
            }
        } else {
            linkText = this.getLinkFromTarget(target);
        }

        // new Notice("Opening link:" + linkText);

        // 适配Excalidraw的双链
        const evtElement = target.closest('.excalidraw-hyperlinkContainer');
        if (evtElement) linkText = this.getLinkFromTarget(target).replace(/^\[\[(.*?)\]\]$/, "$1");

        if (!linkText) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }

        const isCtrlClick = event.ctrlKey && event.button === 0;
        if(isCtrlClick) {
            // 外部链接
            if (this.isValidURL(linkText)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                (window as any).require("electron").shell.openExternal(linkText);
            } else { // 内部链接
                ModalWindow.instances.forEach((instance) => {
                    instance.close();
                });
                this.plugin.app.workspace.openLinkText(linkText, "", 'tab');
            }
            return;
        }

        if (evtElement) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (this.modalLeafRef) {
                const file = this.app.metadataCache.getFirstLinkpathDest(linkText, "") as TFile | undefined;
                if (!file) return;
                this.modalLeafRef.openFile(file);
            }
            return;
        }

        if (ModalWindow.activeInstance?.contentEl) {
            if (this.isValidURL(linkText)) {
                event.preventDefault();
                event.stopImmediatePropagation();

                this.link = linkText;
                ModalWindow.activeInstance?.contentEl.setAttribute('data-src', linkText);

                if (this.webviewPlugin && this.modalLeafRef) { // 使用 webviewer 插件
                    this.clearAllButton(ModalWindow.activeInstance?.contentEl);
                    this.loadSiteByWebViewer(linkText, this.modalLeafRef);
                } else {
                    const modalContainer = this.containerEl.querySelector('.modal-opener-content') as HTMLElement;
                    if (Platform.isMobile) {
                        const frame = modalContainer.createEl("iframe", { cls: "modal-iframe" });
                        frame.src = linkText;
                    } else {
                        this.createWebview(this.contentEl, modalContainer);
                    }

                    if (this.plugin.settings.viewOfDisplayButton === 'both' || 
                        this.plugin.settings.viewOfDisplayButton === 'link') {
                        this.clearAllButton(ModalWindow.activeInstance?.contentEl);
                        this.addFloatingButton(ModalWindow.activeInstance?.contentEl);
                    }
                }
            } else {
                if (linkText?.startsWith('#')) {
                    const currentFilePath = this.app.workspace.getActiveFile()?.path || '';
                    linkText = currentFilePath + linkText;
                }
                const [path, fragment] = linkText.split(/[#]/);
                const file = this.app.metadataCache.getFirstLinkpathDest(path, "") as TFile | undefined;
                if (!file) return;
                if(fragment) {
                    ModalWindow.activeInstance?.contentEl.setAttribute('data-src', `${file.path}#${fragment}`);
                } else {
                    ModalWindow.activeInstance?.contentEl.setAttribute('data-src', `${file.path}`);
                }

                this.updateFragmentLink = true;
            }
        }
    }

    private handleActiveLeafChange() {
        if (ModalWindow.activeInstance !== this) {
            return;
        }

        if (this.modalLeafRef) { // 跳转网页 canvas 或其他文件处理
            const modalElement = this.containerEl.querySelector('.modal-opener');
            if (!modalElement) return;

            const modalContainer = modalElement.querySelector('.modal-opener-content') as HTMLElement;
            if (modalContainer) {
                modalContainer.empty();
                modalContainer.appendChild(this.modalLeafRef.view.containerEl);

                const leafContent = modalContainer.querySelector('.workspace-leaf-content');
                if(leafContent) {
                    const dataType = leafContent.getAttribute('data-type');
                    if (dataType == "empty") {
                        ModalWindow.activeInstance.close();
                        ModalWindow.activeInstance = ModalWindow.instances.length > 0 ? ModalWindow.instances[ModalWindow.instances.length - 1] : null;
                    }
                }

                // 检查内容类型并添加相应按钮
                if (ModalWindow.activeInstance && this.plugin.settings.showFloatingButton) {
                    const hasWebContent = this.modalLeafRef.view.containerEl.querySelector('webview, iframe, .webviewer-content');
                    if (hasWebContent) {
                        if (this.plugin.settings.viewOfDisplayButton === 'both' || 
                            this.plugin.settings.viewOfDisplayButton === 'link') {
                            const webviewerContent = hasWebContent.classList.contains('webviewer-content') 
                                ? hasWebContent 
                                : ModalWindow.activeInstance?.contentEl;
                            this.clearAllButton(webviewerContent as HTMLElement);
                            this.addFloatingButton(webviewerContent as HTMLElement);
                        }

                        const webviewElement = hasWebContent.querySelector('webview');
                        if (webviewElement) {
                            webviewElement.addEventListener("dom-ready", async () => {
                                const srcValue = webviewElement.getAttribute('src');
                                if (srcValue && srcValue !== "data:text/plain,") {
                                    // new Notice(`Updating data-src to ${srcValue}`);
                                    ModalWindow.activeInstance?.contentEl.setAttribute('data-src', srcValue);
                                }
                            });
                        }
                        this.setContainerHeight(modalContainer, true);
                    } else {
                        const activeFile = this.app.workspace.getActiveFile();
                        if (activeFile && !this.updateFragmentLink) {
                            // new Notice(`Updating data-src to ${activeFile.path}`);
                            ModalWindow.activeInstance?.contentEl.setAttribute('data-src', activeFile.path);
                        }
                        this.setContainerHeight(modalContainer, false);

                        if (this.plugin.settings.viewOfDisplayButton === 'both' || 
                            this.plugin.settings.viewOfDisplayButton === 'file') {
                            const leafContent = ModalWindow.activeInstance.containerEl.querySelector('.workspace-leaf-content');
                            this.clearAllButton(ModalWindow.activeInstance?.contentEl);
                            if(leafContent && activeFile) {
                                const dataType = leafContent.getAttribute('data-type');
                                if (dataType === "markdown") {
                                    this.addTocButton(ModalWindow.activeInstance?.contentEl, activeFile.path);
                                }
                            }
                            this.addOpenInNewLeafButton(ModalWindow.activeInstance?.contentEl);
                        }
                    }
                }
                
                this.focusOnModalContent();
                this.updateFragmentLink = false;
            }
        }
    }

    private createWebview = (contentEl: HTMLElement, containerEl: HTMLElement) => {
        if (!this.contentEl) {
            return;
        }
        containerEl.empty();
        const doc = contentEl.doc;
        const webviewEl = doc.createElement('webview');
        webviewEl.setAttribute("allowpopups", "");
        // @ts-ignore
        webviewEl.partition = "persist:webview-vault-" + this.app.appId;
        webviewEl.addClass("modal-webview");
        containerEl.appendChild(webviewEl);

        if (this.link) webviewEl.setAttribute("src", this.link);

        webviewEl.addEventListener("dom-ready", async (event: any) => {
            const { remote } = (window as any).require('electron');
            // @ts-ignore
            const webContents = remote.webContents.fromId(
                (webviewEl as any).getWebContentsId()
            );

            // Open new browser tab if the web view requests it.
            webContents.setWindowOpenHandler((event: any) => {
                this.link = event.url;
                this.createWebview(contentEl, containerEl);
            });

            if (this.plugin.settings.enableWebAutoDarkMode) {
                await this.registerWebAutoDarkMode(webContents);
            }
            if (this.plugin.settings.enableImmersiveTranslation) {
                await this.registerImmersiveTranslation(webContents);
            }
        });

        webviewEl.addEventListener('destroyed', () => {
            if (doc !== this.contentEl.doc) {
                // console.log("Webview destroyed");
                webviewEl.detach();
                // this.createWebview(contentEl, containerEl);
            }
        });

        // doc.contains(this.contentEl) ? this.contentEl.appendChild(webviewEl) : this.contentEl.onNodeInserted(() => {
        //     if (this.loaded) return;
        //     else this.loaded = true;
        //     this.contentEl.doc === doc ? this.contentEl.appendChild(webviewEl) : this.createWebview(contentEl, containerEl);
        // });
    };

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

                if (this.plugin.settings.enableWebAutoDarkMode) {
                    await this.registerWebAutoDarkMode(webContents);
                }
                if (this.plugin.settings.enableImmersiveTranslation) {
                    await this.registerImmersiveTranslation(webContents);
                }
            });
        }
    }

    private focusOnModalContent() {
        if (this.modalLeafRef?.view instanceof MarkdownView) {
            const editor = this.modalLeafRef.view.editor;
            editor.focus();
        } else {
            if (ModalWindow.activeInstance?.contentEl) {
                ModalWindow.activeInstance?.contentEl.focus();
            }
        }
    }

    private setupDoubleClickHandler() {
        if (ModalWindow.activeInstance?.contentEl) {
            this.modalEl.addEventListener('dblclick', (event: MouseEvent) => {
                const target = event.target as HTMLElement;
                if (!this.isClickableArea(target)) {
                    return;
                }
                this.openInNewTab();
            });
        }
    }

    private isClickableArea(element: HTMLElement): boolean {
        // 允许 modal 元素本身或其直接子元素的双击
        if (element === this.modalEl || element.parentElement === this.modalEl) {
            return true;
        }
        if (this.contentEl?.contains(element)) {
            return false;
        }
        if (['P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'CODE', 'IMG'].includes(element.tagName)) {
            return false;
        }
        const excludedContainers = ['.mm-app-container', '.workspace-leaf-content', '.markdown-preview-view', '.cm-node-text'];
        for (const selector of excludedContainers) {
            if (element.closest(selector)) {
                return false;
            }
        }
        return true;
    }

    private setContainerHeight(container: HTMLElement, isLinkView: boolean) {
        const baseHeight = parseInt(this.plugin.settings.modalHeight, 10);
        let heightAdjustment = 5; // 默认调整值

        if (isLinkView) {
            if (this.webviewPlugin) {
                heightAdjustment = 6;
            } else {
                if (Platform.isMobile) {
                    heightAdjustment = 5.5;
                } else {
                    heightAdjustment = 4;
                }
            }
        } else {
            if (!this.plugin.settings.showFileViewHeader) {
                // 针对特殊文件调整样式
                const leafContent = this.containerEl.querySelector('.modal-opener-content .workspace-leaf-content');
                if (leafContent) {
                    const dataType = leafContent.getAttribute('data-type');
                    if (dataType == "canvas" || dataType == "excalidraw" || dataType == "tldraw-view") {
                        if (dataType === 'canvas') {
                            heightAdjustment = 2;
                        } else if (dataType === 'excalidraw') {
                            heightAdjustment = 2;
                        } else if (dataType === 'tldraw-view') {
                            heightAdjustment = -1;
                            if (Platform.isMobile) {
                                heightAdjustment = 2;
                            }
                        }
                    } else {
                        const editingPlugin = this.getPlugin("editing-toolbar");
                        const toolbarPlugin = this.getPlugin("note-toolbar");
                        const topToolbar = this.containerEl.querySelector('.cg-note-toolbar-callout');

                        if (toolbarPlugin || editingPlugin) {
                            if (toolbarPlugin) {
                                heightAdjustment = topToolbar ? 5 : 1;
                            } else {
                                heightAdjustment = 2; // editingPlugin is true here
                            }
                        } else {
                            heightAdjustment = 1; // markdown
                        }
                    }
                }
            } else {
                // 针对特殊文件调整样式
                const leafContent = this.containerEl.querySelector('.modal-opener-content .workspace-leaf-content');
                if (leafContent) {
                    const dataType = leafContent.getAttribute('data-type');
                    if (dataType == "canvas" || dataType == "excalidraw" || dataType == "tldraw-view") {
                        if (dataType === 'canvas') {
                            heightAdjustment = 6;
                        } else if (dataType === 'excalidraw') {
                            heightAdjustment = 6;
                        } else if (dataType === 'tldraw-view') {
                            heightAdjustment = 3;
                            if (Platform.isMobile) {
                                heightAdjustment = 6;
                            }
                        }
                    } else {
                        const editingPlugin = this.getPlugin("editing-toolbar");
                        const toolbarPlugin = this.getPlugin("note-toolbar");
                        if (editingPlugin || toolbarPlugin) {
                            heightAdjustment = toolbarPlugin ? 5 : (editingPlugin ? 5 : 4);
                        } else {
                            heightAdjustment = 1; // markdown
                        }
                    }
                }
            }
        }

        const adjustedModalHeight = `${baseHeight - heightAdjustment}vh`;
        // console.log(`Adjusted Modal Height: ${adjustedModalHeight}`);
        container.style.setProperty('--adjusted-modal-height', adjustedModalHeight);
    }

    private async checkURLReachability(url: string): Promise<boolean> {
        try {
            const response: RequestUrlResponse = await requestUrl({
                url: url,
                method: 'HEAD',
                throw: false // 不抛出错误，而是返回响应
            });
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            return false;
        }
    }

    private getLinkFromTarget(target: HTMLElement): string {
        return target.getAttribute('data-href') || target.getAttribute('href') || target.getAttribute('data-path') || target.getAttribute('filesource') || target.textContent?.trim() || '';
    }

    private isValidURL(url: string): boolean {
        try {
            const parsedURL = new URL(url);
            // 允许 http 和 https 协议
            if (parsedURL.protocol === 'http:' || parsedURL.protocol === 'https:') {
                // 检查是否为本地 IP 地址
                const isLocalIP = /^(https?:\/\/)?(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?(\/.*)?$/.test(url);
                return true || isLocalIP;
            }
            return false;
        } catch {
            return false;
        }
    }

    private exitMultiCursorMode() {
        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.editor) {
            const editor = activeView.editor;
            const cursor = editor.getCursor();
            editor.setCursor(cursor);
        }
    }

    private refreshMarkdownViews = async () => {
        // 获取处理前滚动条位置百分比
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        let scrollPosition: any;
        if (view.getMode() === "preview") {
            scrollPosition = view.previewMode.getScroll();
            // refresh the previewView.
            setTimeout(() => {
                view.previewMode.rerender(true);
            }, 100);
        } else if (view.getMode() === "source") {
            const editView = view.currentMode;
            if (editView && typeof editView.getScroll === 'function') {
                scrollPosition = editView.getScroll();
            } else if (view.editor) {
                scrollPosition = view.editor.getScrollInfo();
            }
            // refresh the editView.
            const editor = view.editor;
            const content = editor.getValue();
            // 第一步：移除所有 ![[]] 中的感叹号
            const modifiedContent = content.replace(/!\[\[(.+?)\]\]/g, '[[$1]]');
            editor.setValue(modifiedContent);

            // 第二步：重新添加感叹号到原本是 ![[]] 的链接
            setTimeout(() => {
                const finalContent = editor.getValue().replace(/\[\[(.+?)\]\]/g, (match, p1) => {
                    // 检查原始内容中是否存在 ![[p1]]
                    return content.includes(`![[${p1}]]`) ? `![[${p1}]]` : `[[${p1}]]`;
                });
                editor.setValue(finalContent);
                // 保持光标位置不变
                const cursor = editor.getCursor();
                editor.setCursor(cursor);
            }, 100);
        }

        // 处理后滚动条滚动回去
        setTimeout(() => {
            const editView = view.currentMode;
            editView.applyScroll(scrollPosition);
        }, 200);
    }

    // 适配NoteToolBar
    private setupToolbarObserver() {
        // 首先移除任何现有的重复工具栏
        this.ensureSingleToolbar();

        // 设置 MutationObserver 来监听 DOM 变化
        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    this.ensureSingleToolbar();
                }
            }
        });

        // 开始观察 modal-opener 的子元素变化
        this.observer.observe(this.contentEl, { childList: true, subtree: true });
    }

    private ensureSingleToolbar() {
        const toolbars = this.contentEl.querySelectorAll('.cg-note-toolbar-container');
        if (toolbars.length > 1) {
            // console.log(`Found ${toolbars.length} toolbars, keeping only the first one`);
            // 保留第一个工具栏，移除其他的
            for (let i = 1; i < toolbars.length; i++) {
                toolbars[i].remove();
            }
        }
    }

    private copyWebLink() {
        if (ModalWindow.activeInstance?.contentEl) {
            const src = ModalWindow.activeInstance.contentEl.getAttribute('data-src') || '';
            if (src) {
                navigator.clipboard.writeText(src)
                    .then(() => new Notice(t("Copied to clipboard")));
            }
        }
    }

    public openInNewTab() {
        if (ModalWindow.activeInstance?.contentEl) {
            const src = ModalWindow.activeInstance.contentEl.getAttribute('data-src') || '';
            // 关闭所有 modal 实例
            ModalWindow.instances.forEach((instance) => {
                instance.close();
            });

            if (this.isValidURL(src)) {
                if (this.webviewPlugin) {
                    const leaf = this.app.workspace.getLeaf(true);
                    this.loadSiteByWebViewer(src, leaf);
                } else {
                    const newLeaf = this.app.workspace.getLeaf(true);
                    const contentEl = newLeaf.view.containerEl;
                    contentEl.empty();
                    if (Platform.isMobile) {
                        const frame = contentEl.createEl("iframe", { cls: "modal-iframe" });
                        frame.src = src;
                    } else {
                        this.createWebview(contentEl, newLeaf.view.containerEl);
                    }
                }
            } else {
                const [filePath, fragment] = src.split('#');
                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    this.plugin.app.workspace.openLinkText(src, filePath, 'tab');
                }
            }
        }
    }

    private openInBrowser() {
        if (ModalWindow.activeInstance?.contentEl) {
            const src = ModalWindow.activeInstance.contentEl.getAttribute('data-src') || '';
            if (this.isValidURL(src)) {
                if (this.webviewPlugin) {
                    (window as any).require("electron").shell.openExternal(src);
                } else {
                    window.open(src);
                }
                // this.close();
            }
        }
    }

    private getPlugin(pluginId: string) {
        const app = this.plugin.app as any;
        return app.plugins.plugins[pluginId];
    }

    private clearAllButton(container: HTMLElement) {
        const buttons = container.querySelectorAll('.floating-menu-container, .floating-button-container.toc-button, .floating-button-container.new-leaf-button');
        buttons.forEach(button => button.remove());
    }

    private createMenuItem(container: HTMLElement, icon: string, title: string, onClick: () => void): HTMLElement {
        const button = container.createEl('button', { cls: 'floating-button menu-item' });
        setIcon(button, icon);

        button.setAttribute('title', title);
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return button;
    }

    // 添加悬浮按钮
    private addOpenInNewLeafButton(container: HTMLElement) {
        const buttonContainer = container.createEl('div', { cls: 'floating-button-container new-leaf-button' });
        const openButton = buttonContainer.createEl('button', { cls: 'floating-button' });

        setIcon(openButton, 'lucide-panel-top');
        openButton.setAttribute('title', t('Opens in new tab'));

        openButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openInNewTab();
        });
    }

    private addFloatingButton(container: HTMLElement) {
        const buttonContainer = container.createEl('div', { cls: 'floating-menu-container' });
        const mainButton = buttonContainer.createEl('button', { cls: 'floating-button main-button' });

        setIcon(mainButton, 'lucide-more-vertical');
        mainButton.setAttribute('title', t("More options"));

        const menuItems = buttonContainer.createEl('div', { cls: 'floating-menu-items' });

        this.createMenuItem(menuItems, 'lucide-compass', t('Open in browser'), () => this.openInBrowser());
        this.createMenuItem(menuItems, 'lucide-panel-top', t('Opens in new tab'), () => this.openInNewTab());
        this.createMenuItem(menuItems, 'lucide-copy', t('Copy web link'), () => this.copyWebLink());

        // 显示/隐藏菜单
        let timeoutId: NodeJS.Timeout | null = null;

        buttonContainer.addEventListener('mouseenter', () => {
            if (timeoutId) clearTimeout(timeoutId);
            menuItems.style.display = 'flex';
        });

        buttonContainer.addEventListener('mouseleave', () => {
            timeoutId = setTimeout(() => {
                menuItems.style.display = 'none';
            }, 300); // 300ms 延迟，给用户一些时间移动到菜单项上
        });

        menuItems.addEventListener('mouseenter', () => {
            if (timeoutId) clearTimeout(timeoutId);
        });

        menuItems.addEventListener('mouseleave', () => {
            timeoutId = setTimeout(() => {
                menuItems.style.display = 'none';
            }, 300);
        });
    }

    private addTocButton(container: HTMLElement, path: string) {
        // 获取当前文件的元数据
        const file = this.app.vault.getAbstractFileByPath(path);
        // console.log(file);
        if (!(file instanceof TFile)) return;

        const metadata = this.app.metadataCache.getCache(file.path);
        const headings = metadata?.headings || [];

        if (!headings || headings.length === 0) return;
    
        const buttonContainer = container.createEl('div', { cls: 'floating-button-container toc-button' });
        const tocButton = this.createMenuItem(buttonContainer, 'list', t('Toggle table of contents'), () => {
            this.toggleTableOfContents(buttonContainer, path);
        });
        tocButton.addClass('toc-toggle');
    
        // 添加鼠标悬浮事件
        buttonContainer.addEventListener('mouseenter', () => {
            clearTimeout(this.hideTimeout);
            this.toggleTableOfContents(buttonContainer, path, true);
        });
    }
    
    private toggleTableOfContents(buttonContainer: HTMLElement, path: string, isHover: boolean = false) {
        let tocContainer = this.contentEl.querySelector('.modal-toc-container') as HTMLElement;
        
        if (tocContainer) {
            if (!isHover) {
                tocContainer.remove();
            }
            return;
        }
    
        // 创建目录容器
        tocContainer = this.contentEl.createEl('div', { cls: 'modal-toc-container' });
        
        // 获取当前文件的元数据
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return;
    
        const metadata = this.app.metadataCache.getCache(file.path);
        const headings = metadata?.headings || [];
    
        // 添加目录标题
        tocContainer.createEl('div', { cls: 'toc-header', text: '目录' });
        
        // 生成目录内容
        this.renderTocContent(tocContainer, headings);
        
        // 定位目录容器到按钮左上方
        const buttonRect = buttonContainer.getBoundingClientRect();
        tocContainer.style.bottom = `${window.innerHeight - buttonRect.bottom + 50}px`;
        tocContainer.style.right = `${window.innerWidth - buttonRect.right + 30}px`;
    
        // 添加鼠标离开事件
        const handleMouseLeave = () => {
            this.hideTimeout = setTimeout(() => {
                tocContainer.remove();
            }, 100);
        };
    
        tocContainer.addEventListener('mouseenter', () => {
            clearTimeout(this.hideTimeout);
        });
    
        tocContainer.addEventListener('mouseleave', handleMouseLeave);
    
        buttonContainer.addEventListener('mouseleave', (e) => {
            const toElement = e.relatedTarget as HTMLElement;
            if (!tocContainer.contains(toElement)) {
                handleMouseLeave();
            }
        });
    }
    
    private renderTocContent(container: HTMLElement, headings: any[]) {
        if (!headings.length) {
            container.createEl('div', { cls: 'toc-empty', text: 'No headings found' });
            return;
        }
    
        const tocList = container.createEl('div', { cls: 'toc-list' });
        const minLevel = Math.min(...headings.map(h => h.level));
        
        // 创建目录项
        headings.forEach((heading) => {
            const tocItem = tocList.createEl('div', { 
                cls: 'toc-item',
                attr: { 'data-heading': heading.heading }
            });
            
            // 创建内容容器，并应用缩进
            const contentContainer = tocItem.createEl('div', { cls: 'toc-item-content' });
            contentContainer.style.paddingLeft = `${(heading.level - minLevel) * 20}px`;
            
            // 添加无序列表样式的圆点
            contentContainer.createEl('span', { cls: 'toc-bullet' });
            
            // 添加标题文本，使用Markdown渲染
            const textContainer = contentContainer.createEl('span', { cls: 'toc-item-text' });
            
            // 使用Obsidian的MarkdownRenderer渲染标题文本
            MarkdownRenderer.render(this.app,
                heading.heading,
                textContainer,
                '',
                this.plugin
            );
            
            // 添加点击事件
            tocItem.addEventListener('click', (e) => {
                e.preventDefault();
                const pathData = this.contentEl.getAttribute('data-src') || '';
                const [filePath, fragment] = pathData.split('#');
                const file = this.app.metadataCache.getFirstLinkpathDest(filePath, '');

                if (file instanceof TFile) {
                    this.app.workspace.openLinkText(`${file.path}#${heading.heading}`, file.path, false);
                    
                    // 高亮当前选中项
                    const allItems = container.querySelectorAll('.toc-item');
                    allItems.forEach(item => item.removeClass('active'));
                    tocItem.addClass('active');
                }
            });
        });
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
                    // 智能选择需要翻译的内容
                    selectors: ["body"],
                    // 排除不需要翻译的元素
                    excludeSelectors: ["pre", "code", ".code", "script", "style"],
                    // 将译文作为 block 的最小字符数
                    blockMinTextCount: 0,
                    // 原文段落的最小字符数
                    paragraphMinTextCount: 1
                }
            };

            // 2. 加载沉浸式翻译 SDK
            const script = document.createElement('script');
            script.async = true;
            script.src = 'https://download.immersivetranslate.com/immersive-translate-sdk-latest.js';
            document.head.appendChild(script);
        `);
    }
}
