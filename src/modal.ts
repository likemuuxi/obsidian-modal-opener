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
        super.close(); // 调用父类的关闭方法
        // 这里可以添加其他关闭时的逻辑
    }

    private async checkURLReachability(url: string): Promise<boolean> {
        try {
            const response = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
            return response.ok || response.type === 'opaque';
        } catch (error) {
            return false;
        }
    }    

    handleFileClick(filePath: string) {
        console.log("filePath", filePath);

        // 使用 setTimeout 延时操作
        setTimeout(() => {
            if (this.associatedLeaf) {
                const containerEl = this.associatedLeaf.view.containerEl;
                console.log("containerEl", containerEl);
                const fileContainer = document.querySelector(".file-modal-container") as HTMLElement;
                if (containerEl) {
                    fileContainer.innerHTML = '';  // 使用 innerHTML 清空内容
                    fileContainer.appendChild(containerEl);
                    this.openedLink = filePath;
                } else {
                    console.log('containerEl is null');
                }
            } else {
                console.log('associatedLeaf is null');
            }
        }, 200);
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
                // 只在点击 modal 背景区域时阻止默认行为
                if (this.plugin.settings.onlyCloseButton) {
                    if (event.target === modalBgElement) {
                        event.stopImmediatePropagation();
                        event.preventDefault();
                        console.log("Modal background click event handled");
                    }
                } else {
                    // 如果设置允许背景点击关闭 modal，处理此逻辑
                    console.log("Modal background click allowed");
                    this.close();
                }
            }, true); // 使用捕获阶段
        }

        // Modal Size
        const modalContainer = this.containerEl.lastChild as HTMLElement;
        if (modalContainer) {
            modalContainer.style.width = this.width;
            modalContainer.style.height = this.height;
        }

        const observer = new MutationObserver((mutationsList, observer) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    const fileModalElement = document.querySelector(".file-modal-container") as HTMLElement;
                    if (fileModalElement) {
                        fileModalElement.addEventListener('click', (event: MouseEvent) => {
                            const target = event.target as HTMLElement;
                            const webLink = target.getAttribute('aria-label');
                            if (webLink && this.isValidURL(webLink)) {
                                event.preventDefault();
                                event.stopImmediatePropagation();
                                this.displayLinkContent(webLink);
                            } else {
                                const filePath = target.getAttribute('href');
                                if (filePath) {
                                    this.handleFileClick(filePath);
                                }
                            }
                        }, true);
                        observer.disconnect(); // 事件绑定成功后停止观察
                    }
                }
            }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });        

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

    async displayFileContent(file: TFile, fragment: string) {
        if (!this.contentEl) {
            console.error("contentEl is undefined in displayFileContent.");
            return;
        }

        this.contentEl.empty();
        this.contentEl.addClass("file-modal");

        const fileContainer = this.contentEl.createEl("div", { cls: "file-modal-container" });
        fileContainer.style.flexGrow = "1";
        fileContainer.style.position = "relative";
        fileContainer.style.overflow = "auto";
        const modalHeightSetting = this.plugin.settings.modalHeight;
        const heightValue = parseInt(modalHeightSetting, 10) - 1;
        const adjustedModalHeight = `${heightValue}vh`;
        fileContainer.style.minHeight = adjustedModalHeight;
        fileContainer.style.maxHeight = adjustedModalHeight;
        fileContainer.style.padding = "0";

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
            const currentLeaf = this.app.workspace.getLeaf();
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile && currentLeaf) {
                const newLeaf = await this.app.workspace.duplicateLeaf(currentLeaf, 'tab');
                await newLeaf.openFile(activeFile);
                (newLeaf as any).tabHeaderEl.style.display = 'none';
                this.associatedLeaf = newLeaf;
                this.openedLink = filePath;
            } else {
                console.error("No active file");
            }

            setTimeout(() => {
                this.app.workspace.openLinkText(filePath, file.path, false);
            }, 150);

            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view && view instanceof MarkdownView) {
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
            // 隐藏标签页
            (leaf as any).tabHeaderEl.style.display = 'none';
            this.openedLink = file.path;
            this.associatedLeaf = leaf;
        }
        // 双击还原
        this.modalEl = document.querySelector('.modal') as HTMLElement;
        // 确保 modal 容器不为空
        if (this.modalEl) {
            this.modalEl.addEventListener('dblclick', (event: MouseEvent) => {
                // 排除内容区域的双击事件
                if (this.contentEl && this.contentEl.contains(event.target as Node)) {
                    console.log("Double-click detected on content area, ignoring.");
                    return;
                }
                console.log("Double-click detected on modal.");

                if (this.openedLink && !this.isValidURL(this.openedLink))
                {
                    this.close();
                    this.app.workspace.openLinkText(this.openedLink, file.path, true);
                    setTimeout(() => {
                        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                        if (view && view instanceof MarkdownView) {
                            const currentState = view.getState();
                            currentState.mode = mode;
                            view.setState(currentState, { history: false });
                        }
                    }, 150);
                }
            });
        } else {
            console.error("Modal element not found.");
        }

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
        linkContainer.style.flexGrow = "1";
        linkContainer.style.position = "relative";
        linkContainer.style.overflow = "auto";
    
        const frame = linkContainer.createEl("iframe");
        frame.src = link;
        frame.style.width = "100%";
        frame.style.height = "100%";
        frame.style.border = "none";
        frame.style.position = "absolute";
        frame.style.top = "0";
        frame.style.left = "0";

        this.openedLink = link;

        this.modalEl = document.querySelector('.modal') as HTMLElement;
        // 确保 modal 容器不为空
        if (this.modalEl) {
            this.modalEl.addEventListener('dblclick', (event: MouseEvent) => {
                // 排除内容区域的双击事件
                if (this.contentEl && this.contentEl.contains(event.target as Node)) {
                    console.log("Double-click detected on content area, ignoring.");
                    return;
                }
                console.log("Double-click detected on modal.");
                if (this.openedLink)
                {
                    const app = this.plugin.app as any;
                    const surfPlugin = app.plugins.plugins["surfing"];
                    if (surfPlugin) {
                        this.close();
                        window.open(this.openedLink);
                    } else {
                        this.close();
                        const newLeaf = this.app.workspace.getLeaf("tab");
                        const container = newLeaf.view.containerEl;
                        container.empty();
                        const frame = container.createEl("iframe");
                        frame.src = this.openedLink;
                        frame.setAttribute("frameborder", "0");
                        frame.style.width = "100%";
                        frame.style.height = "100%";
                        this.app.workspace.revealLeaf(newLeaf);
                    }
                }
            });
        } else {
            console.error("Modal element not found.");
        }
    }
}