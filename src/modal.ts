import { Modal, TFile, WorkspaceLeaf , MarkdownView } from "obsidian";
import ModalOpenPlugin from "./main";

export class ModalWindow extends Modal {
    plugin: ModalOpenPlugin;
    leaf?: WorkspaceLeaf;
    link: string;
    file?: TFile;
    fragment: string
    width: string;
    height: string;
    private associatedLeaf?: WorkspaceLeaf;
    private openedLink?: string;
    private debounceTimeout: NodeJS.Timeout | null = null;
    private debounceDelay = 150; // 防抖延迟时间

    constructor(plugin: ModalOpenPlugin, link: string, file?: TFile, fragment?: string, width?: string, height?: string) {
        super(plugin.app);
        this.plugin = plugin;
        this.link = link;
        this.file = file;
        this.fragment = fragment || '';
        this.width = width || '80%';
        this.height = height || '80%';
    }
    
    close() {
        super.close();
        this.app.workspace.off('active-leaf-change', this.activeLeafChangeHandler);
    }

    private async checkURLReachability(url: string): Promise<boolean> {
        try {
            const response = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
            return response.ok || response.type === 'opaque';
        } catch (error) {
            return false;
        }
    }  

    private handleFileOpen(filePath: string, isExcalidraw: boolean = false) {
        console.log("filePath", filePath);
        const leaf = isExcalidraw ? this.app.workspace.getLeaf(true) : this.associatedLeaf;
        
        if (isExcalidraw) {
            const excalidrawFile = this.app.vault.getAbstractFileByPath(filePath) as TFile;
            leaf?.openFile(excalidrawFile);
            (leaf as any).tabHeaderEl.style.display = 'none';
        }

        setTimeout(() => {
            if (leaf) {
                const containerEl = leaf.view.containerEl;
                console.log("containerEl", containerEl);
                const fileContainer = document.querySelector(".file-modal-container") as HTMLElement;
                if (containerEl && fileContainer) {
                    fileContainer.empty();
                    if (isExcalidraw && this.associatedLeaf) {
                        this.associatedLeaf.detach();
                        this.associatedLeaf = undefined;
                    }
                    fileContainer.appendChild(containerEl);
                    this.openedLink = filePath;
                    this.associatedLeaf = leaf;
                } else {
                    console.log('containerEl or fileContainer is null');
                }
            } else {
                console.log('Leaf is null');
            }
        }, 150);
    }

    handleFileModalClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
    
        // 如果点击的是 canvas-minimap 元素
        if (target.classList.contains('canvas-minimap')) {
            const parentElement = target.closest('.internal-embed.canvas-embed.inline-embed.is-loaded') as HTMLElement;
            if (parentElement) {
                const srcPath = parentElement.getAttribute('src');
                console.log("srcPath", srcPath);
                if (srcPath) {
                    this.handleFileOpen(srcPath);
                    return;
                }
            }
        }

        // 如果点击的是 excalidraw 元素
        if (target.classList.contains('excalidraw-canvas-immersive')) {
            const filesource = target.getAttribute('filesource');
            console.log("filesource", filesource);
            if (filesource) {
                this.handleFileOpen(filesource, true);
                return;
            }
        }

        // 如果点击的是 auto content toc
        if (target.classList.contains('internal-link')) {
            const parentElement = target.closest('.block-language-table-of-contents') as HTMLElement;
            if (parentElement) {
                const headingPath = target.getAttribute('href');
                console.log("headingPath", headingPath);
                if (headingPath) {
                    const currentFilePath = this.app.workspace.getActiveFile()?.path || '';
                    const filePath = `${currentFilePath}${headingPath}`;
                    console.log("filePath", filePath);
                    this.app.workspace.openLinkText(filePath, "", false);
                    return;
                }
            }
        }
    
        const webLink = target.getAttribute('aria-label');
        const filePath = target.getAttribute('href');
    
        if (webLink && this.isValidURL(webLink)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.displayLinkContent(webLink);
        } else if (filePath) {
            this.handleFileOpen(filePath);
        }
    }

    isValidURL(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    async onOpen() {
        if (!this.contentEl) {
            console.error("contentEl is undefined");
            return;
        }

        const modalBgElement = document.querySelector(".modal-bg") as HTMLElement;
        if (modalBgElement) {
            modalBgElement.addEventListener("click", (event) => {
                console.log("Click event on modal background detected");
                if (this.plugin.settings.onlyCloseButton) {
                    if (event.target === modalBgElement) {
                        event.stopImmediatePropagation();
                        event.preventDefault();
                        console.log("Modal background click event handled");
                    }
                } else {
                    console.log("Modal background click allowed");
                    this.close();
                }
            }, true);
        }

        // 解决在modal窗口中点击canvas、excalidraw链接和不在modal中显示的问题
        const observer = new MutationObserver((mutationsList, observer) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    const fileModalElement = document.querySelector(".file-modal-container") as HTMLElement;
                    if (fileModalElement) {
                        fileModalElement.addEventListener('click', this.handleFileModalClick.bind(this), true);
                        observer.disconnect();
                        break;
                    }
                }
            }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });  

        // Modal Size
        const modalContainer = this.containerEl.lastChild as HTMLElement;
        if (modalContainer) {
            modalContainer.style.width = this.width;
            modalContainer.style.height = this.height;
        }

        // Display content based on file or link
        if (this.file) {
            console.log("file", this.file);
            await this.displayFileContent(this.file, this.fragment);
        } else {
            if (!this.link.startsWith('http://') && !this.link.startsWith('https://')) {
                const httpsLink = `https://${this.link}`;
                if (await this.checkURLReachability(httpsLink)) {
                    this.link = httpsLink;
                } else {
                    this.link = `http://${this.link}`;
                }
            }
            console.log("link", this.link);
            this.displayLinkContent(this.link);
        }
    }

    onClose() {
        if (this.leaf && this.fragment == '') {
            // 清理 leaf
            this.leaf.detach();
            this.leaf = undefined;
        }

        // 检查并关闭关联的标签页
        if (this.associatedLeaf) {
            this.associatedLeaf.detach();
            this.associatedLeaf = undefined;
        }

        const { contentEl } = this;
        contentEl.empty();
    }

    private activeLeafChangeHandler = () => {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        const linkModalContainer = document.querySelector('.link-modal-container');
        const surfingLeaves = this.app.workspace.getLeavesOfType('surfing-view');
        if (linkModalContainer && surfingLeaves.length > 0) {
            const latestSurfingLeaf = surfingLeaves.length > 1 ? surfingLeaves[1] : surfingLeaves[0];
            (latestSurfingLeaf as any).tabHeaderEl.style.display = 'none';
    
            this.debounceTimeout = setTimeout(() => {
                if (this.associatedLeaf) {
                    this.associatedLeaf.detach();
                    this.associatedLeaf = undefined;
                }
                this.associatedLeaf = latestSurfingLeaf;
    
                linkModalContainer.empty();
                linkModalContainer.appendChild(latestSurfingLeaf.view.containerEl);
    
                // 获取 wb-frame 的 src 属性
                const wbFrame = latestSurfingLeaf.view.containerEl.querySelector('.wb-frame');
                if (wbFrame) {
                    const src = wbFrame.getAttribute('src');
                    if (src) {
                        this.openedLink = src;
                        console.log('wb-frame src:', src);
                    }
                }
                console.log('Latest surfing view:', latestSurfingLeaf);
            }, this.debounceDelay);
        } else {
            console.log('No surfing view open');
        }
    };

    private setContainerHeight(container: HTMLElement) {
        const modalHeightSetting = this.plugin.settings.modalHeight;
        const app = this.app as any;
        const editingPlugin = app.plugins.plugins["editing-toolbar"];
        let adjustedModalHeight;
        if (!this.plugin.settings.showFileViewHeader) {
            const heightValue = parseInt(modalHeightSetting, 10) - (editingPlugin ? 2 : 1);
            adjustedModalHeight = `${heightValue}vh`;
        } else {
            adjustedModalHeight = '81vh';
        }
        
        container.style.minHeight = adjustedModalHeight;
        container.style.maxHeight = adjustedModalHeight;
        container.style.flexGrow = "1";
        container.style.position = "relative";
        container.style.overflow = "auto";
        container.style.padding = "0";
    }

    async displayFileContent(file: TFile, fragment: string) {
        if (!this.contentEl) {
            console.error("contentEl is undefined in displayFileContent.");
            return;
        }

        this.contentEl.empty();
        this.contentEl.addClass("file-modal");

        const fileContainer = this.contentEl.createEl("div", { cls: "file-modal-container" });
        this.setContainerHeight(fileContainer);

        let mode: 'source' | 'preview';
        switch (this.plugin.settings.fileOpenMode) {
            case 'source':
                mode = 'source';
                break;
            case 'preview':
                mode = 'preview';
                break;
            default:
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                mode = activeView?.getMode() === 'source' ? 'source' : 'preview';
        }

        if (fragment) {
            const filePath = `${file.path}#${fragment}`;
            const newLeaf = this.app.workspace.getLeaf('tab');
            await newLeaf.openFile(file);
            this.openedLink = filePath;
            this.associatedLeaf = newLeaf;

            setTimeout(() => {
                this.app.workspace.openLinkText(filePath, file.path, false);
            }, 150);

            const view = newLeaf.view as MarkdownView;
            if (view instanceof MarkdownView) {
                const currentState = view.getState();
                currentState.mode = mode;
                view.setState(currentState, { history: false });
                fileContainer.appendChild(view.containerEl);
                
                this.contentEl.addEventListener('keydown', (event: KeyboardEvent) => {
                    if (event.ctrlKey && event.key === 'e') {
                        event.preventDefault();
                        (view as any).toggleMode();
                    }
                });
            }
        } else {
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(file, { state: { mode } });
            // 隐藏标签页
            (leaf as any).tabHeaderEl.style.display = 'none';

            if (leaf.view instanceof MarkdownView) {
                const view = leaf.view;
                this.contentEl.addEventListener('keydown', (event: KeyboardEvent) => {
                    if (event.ctrlKey && event.key === 'e') {
                        event.preventDefault();
                        (view as any).toggleMode();
                    }
                });
            }
            fileContainer.appendChild(leaf.view.containerEl);
            this.leaf = leaf;
            this.openedLink = file.path;
            this.associatedLeaf = leaf;
        }

        this.setupDoubleClickHandler(file, mode);
        this.contentEl.tabIndex = -1;
        this.contentEl.focus();
    }

    displayLinkContent(link:string) {
        if (!this.contentEl) {
            console.error("contentEl is undefined in displayLinkContent.");
            return;
        }
        this.contentEl.empty();
        this.contentEl.addClass("link-modal");
        const linkContainer = this.contentEl.createEl("div", { cls: "link-modal-container" });
        this.setContainerHeight(linkContainer);
    
        const app = this.plugin.app as any;
        const surfPlugin = app.plugins.plugins["surfing"];
        if (surfPlugin) {
            window.open(link);
            this.openedLink = link;
            setTimeout(() => {
                const currentLeaf = this.app.workspace.getLeaf(false);
                (currentLeaf as any).tabHeaderEl.style.display = 'none';
                linkContainer.appendChild(currentLeaf.view.containerEl);
                if (this.associatedLeaf) {
                    this.associatedLeaf.detach();
                    this.associatedLeaf = undefined;
                }
                this.associatedLeaf = currentLeaf;
                this.app.workspace.on('active-leaf-change', this.activeLeafChangeHandler);
            }, 150);

        } else {
            const frame = linkContainer.createEl("iframe");
            frame.src = link;
            frame.style.width = "100%";
            frame.style.height = "100%";
            frame.style.border = "none";
            frame.style.position = "absolute";
            frame.style.top = "0";
            frame.style.left = "0";
            this.openedLink = link;
        }

        this.setupDoubleClickHandler();
    }

    private setupDoubleClickHandler(file?: TFile, mode?: string) {
        this.modalEl = document.querySelector('.modal') as HTMLElement;
        if (this.modalEl) {
            this.modalEl.addEventListener('dblclick', (event: MouseEvent) => {
                if (this.contentEl?.contains(event.target as Node)) {
                    console.log("Double-click detected on content area, ignoring.");
                    return;
                }
                console.log("Double-click detected on modal.");

                if (this.openedLink) {
                    this.close();
                    if (this.isValidURL(this.openedLink)) {
                        this.openExternalLink(this.openedLink);
                    } else if (file) {
                        this.openInternalLink(this.openedLink, file.path, mode);
                    }
                }
            });
        } else {
            console.error("Modal element not found.");
        }
    }

    private openExternalLink(link: string) {
        const surfPlugin = this.getPlugin("surfing");
        if (surfPlugin) {
            window.open(link);
        } else {
            this.openInNewLeaf(link);
        }
    }

    private openInternalLink(link: string, filePath: string, mode?: string) {
        this.app.workspace.openLinkText(link, filePath, true);
        if (mode) {
            setTimeout(() => this.setViewMode(mode), 150);
        }
    }

    private openInNewLeaf(link: string) {
        const newLeaf = this.app.workspace.getLeaf("tab");
        const container = newLeaf.view.containerEl;
        container.empty();
        const frame = container.createEl("iframe");
        frame.src = link;
        frame.setAttribute("frameborder", "0");
        frame.style.width = "100%";
        frame.style.height = "100%";
        this.app.workspace.setActiveLeaf(newLeaf, { focus: true });
    }

    private setViewMode(mode: string) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view instanceof MarkdownView) {
            const currentState = view.getState();
            currentState.mode = mode;
            view.setState(currentState, { history: false });
        }
    }

    private getPlugin(pluginId: string) {
        const app = this.plugin.app as any;
        return app.plugins.plugins[pluginId];
    }
}