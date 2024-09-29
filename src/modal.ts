import { Modal, TFile, WorkspaceLeaf , MarkdownView, Notice , Scope, requestUrl, RequestUrlResponse } from "obsidian";
import ModalOpenerPlugin from "./main";
import tr from "./lang/locale/tr";

export class ModalWindow extends Modal {
    plugin: ModalOpenerPlugin;
    leaf?: WorkspaceLeaf;
    link: string;
    file?: TFile;
    fragment: string
    width: string;
    height: string;
    public scope: Scope;
    private associatedLeaf?: WorkspaceLeaf;
    
    private handledLeaves: WorkspaceLeaf[] = [];
    private static instances: ModalWindow[] = [];
    private static activeInstance: ModalWindow | null = null;
    private boundHandleActiveLeafChange: () => void;
    private updateFragmentLink: boolean;
    private observer: MutationObserver | null = null;

    constructor(plugin: ModalOpenerPlugin, link: string, file?: TFile, fragment?: string, width?: string, height?: string) {
        super(plugin.app);
        this.plugin = plugin;
        this.link = link;
        this.file = file;
        this.fragment = fragment || '';
        this.width = width || `${this.plugin.settings.modalWidth}%`;
        this.height = height || `${this.plugin.settings.modalHeight}%`;
        this.scope = new Scope(this.app.scope); // Allow app commands to work inside modal
        this.boundHandleActiveLeafChange = this.handleActiveLeafChange.bind(this);
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

        this.containerEl.addEventListener('click', this.handleInternalLinkClick, true);

        const modalBgElement = this.containerEl.querySelector(".modal-bg.modal-opener-bg") as HTMLElement;
        if (modalBgElement) {
            modalBgElement.addEventListener("click", (event) => {
                if (this.plugin.settings.onlyCloseButton) {
                    if (event.target === modalBgElement) {
                        event.stopImmediatePropagation();
                        event.preventDefault();
                    }
                } else {
                    this.close();
                }
            }, true);
        }

        // Modal Size
        const modal = this.containerEl.lastChild as HTMLElement;
        if (modal) {
            modal.style.width = this.width;
            modal.style.height = this.height;
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
        this.scope.register([], 'Escape', (evt: KeyboardEvent) => {
            evt.preventDefault();
            this.close();
        });

        setTimeout(() => {
            if (ModalWindow.activeInstance === this) {
                this.app.workspace.on('active-leaf-change', this.boundHandleActiveLeafChange);
            }
        }, 100);
    }

    close() {
        super.close();
        this.containerEl.removeEventListener('click', this.handleInternalLinkClick, true);
        this.app.workspace.off('active-leaf-change', this.boundHandleActiveLeafChange);
        ModalWindow.instances = ModalWindow.instances.filter(instance => instance !== this);
        if (ModalWindow.activeInstance === this) {
            ModalWindow.activeInstance = ModalWindow.instances[ModalWindow.instances.length - 1] || null;
        }
        if (ModalOpenerPlugin.activeModalWindow === this) {
            ModalOpenerPlugin.activeModalWindow = null;
        }
    }

    onClose() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        if (this.associatedLeaf) {
            this.associatedLeaf.detach();
            this.associatedLeaf = undefined;
        }

        this.handledLeaves.forEach(leaf => {
            if (leaf.view) {
                leaf.detach();
            }
        });

        this.handledLeaves = [];

        const { contentEl } = this;
        contentEl.empty();
        // document.body.removeClass('modal-tab-header-hidden');
    }

    private handleActiveLeafChange() {
        if (ModalWindow.activeInstance !== this) {
            return;
        }

        const activeLeaf = this.app.workspace.getLeaf(false);
        this.associatedLeaf = activeLeaf;
        if (activeLeaf) {
            const modalElement = this.containerEl.querySelector('.modal-opener');
            if (!modalElement) return;

            const modalContainer = modalElement.querySelector('.modal-opener-content');
            if (modalContainer) {
                modalContainer.empty();
                modalContainer.appendChild(activeLeaf.view.containerEl);

                this.handledLeaves.push(activeLeaf);

                const wbViewContent = activeLeaf.view.containerEl.querySelector('.wb-view-content');
                const activeFile = this.app.workspace.getActiveFile();
                if (wbViewContent) {
                    const webviewElement = wbViewContent.querySelector('webview');
                    if (webviewElement) {
                        const srcValue = webviewElement.getAttribute('src');
                        if (srcValue) {
                            modalContainer.setAttribute('data-src', srcValue);
                        }
                    }
                } else if (activeFile && !this.updateFragmentLink) {
                    const filePath = activeFile.path;
                    modalContainer.setAttribute('data-src', filePath);
                }

                this.focusOnModalContent();
                this.updateFragmentLink = false;
            }
        }
    }


    async displayFileContent(file: TFile, fragment: string) {
        if (!this.contentEl) {
            return;
        }
        
        this.contentEl.empty();
        const fileContainer = this.contentEl.createEl("div", "modal-opener-content");
        fileContainer.setAttribute("data-src", file.path + (fragment ? '#' + fragment : ''));

        this.setContainerHeight(fileContainer, false);

        let mode: 'source' | 'preview';
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        switch (this.plugin.settings.fileOpenMode) {
            case 'source':
                mode = 'source';
                break;
            case 'preview':
                mode = 'preview';
                break;
            default:
                mode = activeView?.getMode() === 'source' ? 'source' : 'preview';
        }

        if (fragment) {
            const filePath = `${file.path}#${fragment}`;
            const newLeaf = this.app.workspace.getLeaf(true);
            this.handledLeaves.push(newLeaf);
            await newLeaf.openFile(file);

            if (this.plugin.settings.hideTabHeader) {
                (newLeaf as any).tabHeaderEl.style.display = 'none';
            }
            // if (newLeaf.view && newLeaf.view.containerEl) {
            //     document.body.addClass('modal-tab-header-hidden');
            // }
            this.associatedLeaf = newLeaf;

            setTimeout(() => {
                this.app.workspace.openLinkText(filePath, file.path, false);
            }, 100);

            const view = newLeaf.view as MarkdownView;
            if (view instanceof MarkdownView) {
                const currentState = view.getState();
                currentState.mode = mode;
                view.setState(currentState, { history: false });
                fileContainer.appendChild(view.containerEl);
            }
        } else {
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(file, { state: { mode } });
            this.handledLeaves.push(leaf);
            // if (leaf.view && leaf.view.containerEl) {
            //     document.body.addClass('modal-tab-header-hidden');
            // }
            if (this.plugin.settings.hideTabHeader) {
                (leaf as any).tabHeaderEl.style.display = 'none';
            }

            fileContainer.appendChild(leaf.view.containerEl);
            this.leaf = leaf;
            this.associatedLeaf = leaf;
        }

        const noteToolbarPlugin = this.getPlugin("note-toolbar");
        if(noteToolbarPlugin) {
            this.setupToolbarObserver();
        }

        this.setupDoubleClickHandler();
        this.contentEl.tabIndex = -1;
        this.contentEl.focus();
    }

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

    displayLinkContent(link:string) {
        if (!this.contentEl) {
            return;
        }
        this.contentEl.empty();
        
        const linkContainer = this.contentEl.createEl("div", "modal-opener-content");
        linkContainer.setAttribute("data-src", this.link);
    
        const surfPlugin = this.getPlugin("surfing");
        if (surfPlugin) {
            window.open(link);
            setTimeout(() => {
                const currentLeaf = this.app.workspace.getLeaf(false);
                this.handledLeaves.push(currentLeaf);
                // if (currentLeaf.view && currentLeaf.view.containerEl) {
                //     document.body.addClass('modal-tab-header-hidden');
                // }
                if (this.plugin.settings.hideTabHeader) {
                    (currentLeaf as any).tabHeaderEl.style.display = 'none';
                }
                linkContainer.appendChild(currentLeaf.view.containerEl);
                if (this.associatedLeaf) {
                    this.associatedLeaf.detach();
                    this.associatedLeaf = undefined;
                }
                this.associatedLeaf = currentLeaf;

                this.setContainerHeight(linkContainer, true);
            }, 150);
        } else {
            const frame = linkContainer.createEl("iframe", { cls: "modal-iframe" });
            frame.src = link;
        }
        this.setupDoubleClickHandler();
    }


    private getLinkFromTarget(target: HTMLElement): string {
        return target.getAttribute('data-href') || target.getAttribute('href') || target.getAttribute('data-path') || target.textContent?.trim() || '';
    }

    private handleInternalLinkClick = (event: MouseEvent) => {
        let target = event.target as HTMLElement;
        let linkText = this.getLinkFromTarget(target)
        if (linkText?.startsWith('#')) {
            const currentFilePath = this.app.workspace.getActiveFile()?.path || '';
            linkText = currentFilePath + linkText;
        }
        const [path, fragment] = linkText.split(/[#]/);
        const abstractFile = this.app.metadataCache.getFirstLinkpathDest(path, "");
        let file: TFile | undefined;

        if (abstractFile instanceof TFile) {
            file = abstractFile;
        } else {
            file = undefined;
        }
        
        // 检测文件是否存在
        if (!file && !this.isValidURL(linkText)) {
            return;
        }
        
        if (file) {
            const filePath = `${file.path}#${fragment}`;
            const modalContainer = this.containerEl.querySelector('.modal-opener-content');
            if (modalContainer) {
                modalContainer.setAttribute('data-src', filePath);
                this.updateFragmentLink = true;
            }
        }
    }
    
    private focusOnModalContent() {
        if (this.associatedLeaf?.view instanceof MarkdownView) {
            const editor = this.associatedLeaf.view.editor;
            editor.focus();
        } else {
            const modalContainer = this.containerEl.querySelector('.modal-opener-content');
            if (modalContainer instanceof HTMLElement) {
                modalContainer.focus();
            }
        }
    }

    public openInNewTab() {
        const modalElement = this.containerEl.querySelector('.modal-opener');
        if (!modalElement) return;
        const modalContainer = modalElement.querySelector('.modal-opener-content');
    
        if (modalContainer) {
            const src = modalContainer.getAttribute('data-src') || '';
            if (this.isValidURL(src)) {
                this.openExternalLink(src);
            } else {
                const [filePath, fragment] = src.split('#');
                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    this.plugin.app.workspace.openLinkText(src, filePath, 'tab');
                }
            }
            // 关闭所有 modal 实例
            ModalWindow.instances.forEach((instance) => {
                instance.close();
            });
        }
    }

    private setupDoubleClickHandler() {
        this.modalEl = this.containerEl.querySelector('.modal-opener') as HTMLElement;

        if (this.modalEl) {
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

    private openExternalLink(link: string) {
        const surfPlugin = this.getPlugin("surfing");
        if (surfPlugin) {
            window.open(link);
        } else {
            const newLeaf = this.app.workspace.getLeaf(true);
            const container = newLeaf.view.containerEl;
            container.empty();
            const frame = container.createEl("iframe", { cls: "modal-iframe" });
            frame.src = link;
            this.app.workspace.setActiveLeaf(newLeaf, { focus: true });
        }
    }

    private setContainerHeight(container: HTMLElement, isLinkView: boolean) {
        let adjustedModalHeight: string;
        const baseHeight = parseInt(this.plugin.settings.modalHeight, 10);
        
        if (isLinkView) {
            if (!this.plugin.settings.showLinkViewHeader) { 
                const hasBookmarkBar = this.containerEl.querySelector('.wb-bookmark-bar') !== null;
                if (hasBookmarkBar) {
                    adjustedModalHeight = `${baseHeight + 1}vh`;
                } else {
                    adjustedModalHeight = `${baseHeight - 2}vh`;
                }
            } else {
                adjustedModalHeight = `${baseHeight - 5}vh`;
            }
        } else {
            const editingPlugin = this.getPlugin("editing-toolbar");
            if (!this.plugin.settings.showFileViewHeader) {
                adjustedModalHeight = `${baseHeight - (editingPlugin ? 2 : 1)}vh`;
            } else {
                adjustedModalHeight = `${baseHeight - 5}vh`;
            }
        }

        container.style.setProperty('--adjusted-modal-height', adjustedModalHeight);
    }

    private getPlugin(pluginId: string) {
        const app = this.plugin.app as any;
        return app.plugins.plugins[pluginId];
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

    isValidURL(url: string): boolean {
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
}